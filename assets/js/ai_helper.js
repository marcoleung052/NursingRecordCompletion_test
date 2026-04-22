import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    steps: [],
    completedIndices: new Set(),
    currentStepIndex: null,
    phase: "label",
    options: [],
    activeIndex: 0,
    full: null,
    currentMapping: []
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100;

  function renderOverlay(prefix, suggestion) {
    if (!suggestion) {
      overlay.innerHTML = "";
      return;
    }
    let displaySuggestion = suggestion;
    if (aiRef.type !== "multi-step-options" && suggestion.startsWith(prefix)) {
      displaySuggestion = suggestion.slice(prefix.length);
    }

    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${displaySuggestion}</span>
    `;
  }

  function resetAI() {
    aiRef.type = null;
    aiRef.steps = [];
    aiRef.completedIndices.clear();
    aiRef.currentStepIndex = null;
    aiRef.phase = "label";
    aiRef.options = [];
    aiRef.activeIndex = 0;
    aiRef.full = null;
    overlay.innerHTML = "";
  }

  function isChinese(char) {
    return /[\u4e00-\u9fa5]/.test(char);
  }

  function getSmartSpace(prevText, nextText, forceSpace = false) {
    if (!prevText || !nextText) return "";
    const lastChar = prevText.slice(-1); // 輸入框最後一個字
    const firstChar = nextText[0];       // 即將插入的第一個字

    // 1. 如果最後一個字已經是空格或換行，不加空白
    if (/\s/.test(lastChar)) return "";

    // 2. 定義標點符號黑名單（這些符號前後通常不需要額外空格）
    const punctuation = ".,;!?，。；！？、：:()[]{} \n";
    
    // 如果前一個字或後一個字是標點符號，不加空白
    if (punctuation.includes(lastChar) || punctuation.includes(firstChar)) {
      return "";
    }

    // 3. 情況：強制要求加空白 (用於 Option 完接下一個 Step 的 Label)
    if (forceSpace) return " ";

    // 4. 規則：只有「中接中」才不加空白
    if (isChinese(lastChar) && isChinese(firstChar)) {
      return "";
    }

    // 5. 其餘情況 (中英、英英、英中) 皆補空白
    return " ";
  }
  function replaceTimeWithInput(text) {
    const input = document.getElementById("datetime");
    const now = new Date();
    const defaultTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    let timeHHMM = defaultTime;
    let dateSlash = now.toLocaleDateString('zh-TW');

    if (input && input.value) {
      const [datePart, timePart] = input.value.split("T");
      const [hh, mm] = timePart.split(":");
      timeHHMM = `${hh}:${mm}`;
      dateSlash = datePart.replace(/-/g, "/");
    }
    return text
      .replace(/\bxxxx\/xx\/xx xx:xx:xx\b/gi, `${dateSlash} ${timeHHMM}:00`)
      .replace(/\bxxxx\/xx\/xx xx:xx\b/gi, `${dateSlash} ${timeHHMM}`)
      .replace(/\bxx:xx\b/gi, timeHHMM);
  }

function updateStepState() {
    const remainingSteps = aiRef.steps
      .map((s, idx) => ({ ...s, originalIndex: idx }))
      .filter(s => !aiRef.completedIndices.has(s.originalIndex));

    if (remainingSteps.length === 0 && aiRef.phase === "label") {
      resetAI();
      return;
    }

    if (aiRef.phase === "label") {
      aiRef.options = remainingSteps.map(s => s.label);
      aiRef.currentMapping = remainingSteps.map(s => s.originalIndex);
    } else {
      const currentStep = aiRef.steps[aiRef.currentStepIndex];
      if (currentStep) {
        let finalOptions = [...currentStep.options]; // 複製一份原始選項

        // ⭐ 取得計算數值
        const bmiData = calculateRawBMI(); // 假設這只回傳數字，例如 22.5

        if (bmiData && currentStep.label.includes("BMI")) {
          if (currentStep.label.includes("BMI值")) {
            // 直接把計算結果填入第一個選項
            finalOptions = [`：${bmiData}`];
          } 
          else if (currentStep.label.includes("BMI結果")) {
            // 根據計算出的 BMI，選擇對應後端的 options 索引
            // 假設後端順序是：0:過輕, 1:適中, 2:輕度, 3:中度
            let index = 1; // 預設適中
            if (bmiData < 18.5) index = 0;
            else if (bmiData >= 24 && bmiData < 27) index = 1; // 適中/過重依據你MD定義
            else if (bmiData >= 27 && bmiData < 30) index = 2;
            else if (bmiData >= 30) index = 3;
            
            // ⭐ 這裡直接取後端給的 options[index]
            if (finalOptions[index]) {
              finalOptions = [finalOptions[index]]; 
            }
          }
        }

        aiRef.options = finalOptions.map(opt => replaceTimeWithInput(opt));
      } else {
        aiRef.phase = "label";
        updateStepState();
        return;
      }
    }

    aiRef.activeIndex = 0;
    aiRef.full = aiRef.options[0] || null;
    renderOverlay(textarea.value, aiRef.full);
  }

  // 輔助函式：只負責算數字
  function calculateRawBMI() {
    const text = textarea.value;
    const weightMatch = text.match(/體重\s*[:：]?\s*(\d+(\.\d+)?)/);
    const heightMatch = text.match(/身高\s*[:：]?\s*(\d+(\.\d+)?)/);
    if (weightMatch && heightMatch) {
      const w = parseFloat(weightMatch[1]);
      const h = parseFloat(heightMatch[1]) / 100;
      return (w / (h * h)).toFixed(1);
    }
    return null;
  }
  
  async function callAI(prompt) {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("pid");

    try {
      const res = await apiFetch("/predict", {
        method: "POST",
        body: JSON.stringify({ prompt, patient_id: patientId })
      });

      if (!res.completions?.length) {
        resetAI();
        return;
      }
      const skill = res.completions[0];
      aiRef.type = skill.type;

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.completedIndices.clear();

        // ⭐ 修改：更精確地匹配第一個 Label
        const trimmedPrompt = prompt.trim();
        const firstLabel = skill.steps[0].label;
        
        if (trimmedPrompt === firstLabel || trimmedPrompt.endsWith(firstLabel)) {
          // 如果輸入內容剛好結尾是第一個 Label (例如 Admitted)
          aiRef.completedIndices.add(0);
          aiRef.currentStepIndex = 0;
          aiRef.phase = "option";
        } else {
          aiRef.phase = "label";
        }
        updateStepState();
      } else {
        aiRef.options = (skill.options || skill.candidates || [skill.full || skill.text || ""])
          .map(o => replaceTimeWithInput(o));
        aiRef.activeIndex = 0;
        aiRef.full = aiRef.options[0];
        renderOverlay(prompt, aiRef.full);
      }
    } catch (err) {
      console.error("AI Error:", err);
      resetAI();
    }
  }

  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);
    const text = textarea.value;
    const lastChar = text.slice(-1);

    // ⭐ 如果最後一個字是換行，強制重置狀態，準備迎接新 Skill
    if (lastChar === "\n") {
      resetAI();
      return;
    }

    if (aiRef.type === "multi-step-options") {
      renderOverlay(text, aiRef.full);
      return;
    }
    
    if (!text.trim()) { resetAI(); return; }
    typingTimer = setTimeout(() => callAI(text), FRONTEND_DELAY);
  });
  
  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options || aiRef.options.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = (e.key === "ArrowDown") ? 1 : -1;
      aiRef.activeIndex = (aiRef.activeIndex + dir + aiRef.options.length) % aiRef.options.length;
      aiRef.full = aiRef.options[aiRef.activeIndex];
      renderOverlay(textarea.value, aiRef.full);
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const chosen = aiRef.full;
      if (!chosen) return;

      if (aiRef.type === "multi-step-options") {
        // ... (這部分維持你的多步邏輯)
        if (aiRef.phase === "label") {
          const space = getSmartSpace(textarea.value, chosen, true);
          textarea.value += space + chosen;
          const selectedIdx = aiRef.currentMapping[aiRef.activeIndex];
          for (let i = 0; i < selectedIdx; i++) {
            aiRef.completedIndices.add(i);
          }
          aiRef.currentStepIndex = selectedIdx;
          aiRef.phase = "option";
        } else {
          const space = getSmartSpace(textarea.value, chosen, false);
          textarea.value += space + chosen;
          aiRef.completedIndices.add(aiRef.currentStepIndex);
          aiRef.phase = "label";
        }
        updateStepState();
      } else {
        // ⭐ 修正：針對不同類型決定是「取代」還是「追加」
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();
        
        // 如果是這幾種「前綴觸發」類型，才需要刪除已輸入的 trigger 再取代
        const needsReplace = ["trigger-prefix", "trigger-multi-prefix"].includes(aiRef.type);

        if (needsReplace) {
          const triggerIndex = text.lastIndexOf(trigger);
          if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        }
        
        // 取得智慧空白並追加
        const space = getSmartSpace(textarea.value, chosen, false);
        textarea.value += space + chosen;
        
        const currentContent = textarea.value;
        resetAI();
        callAI(currentContent); // 繼續偵測後續是否有 multi-step
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") resetAI();
  });
}
