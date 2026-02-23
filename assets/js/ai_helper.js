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
    const firstChar = nextText[0];       // 即將插入的第一個字

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
    // 找出尚未完成的 steps
    const remainingSteps = aiRef.steps
      .map((s, idx) => ({ ...s, originalIndex: idx }))
      .filter(s => !aiRef.completedIndices.has(s.originalIndex));

    // 如果連當前正在選 Option 的步驟都被標記完成了，且沒有剩下的了，才重置
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
        aiRef.options = currentStep.options.map(opt => replaceTimeWithInput(opt));
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
  async function callAI(prompt) {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("id");

    try {
      const res = await apiFetch("/api/predict", {
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
        if (aiRef.phase === "label") {
          // --- 情況 A：選中 Label ---
          const space = getSmartSpace(textarea.value, chosen, true);
          textarea.value += space + chosen;
          
          const selectedIdx = aiRef.currentMapping[aiRef.activeIndex];
          
          // ⭐ 修正：只標記「之前」的步驟為已完成，當前步驟 (selectedIdx) 先不標記
          for (let i = 0; i < selectedIdx; i++) {
            aiRef.completedIndices.add(i);
          }
          
          aiRef.currentStepIndex = selectedIdx;
          aiRef.phase = "option"; // 進入選內容階段
        } else {
          // --- 情況 B：選中 Option ---
          const space = getSmartSpace(textarea.value, chosen, false);
          textarea.value += space + chosen;
          
          // ⭐ 此時才正式標記當前步驟已完成
          aiRef.completedIndices.add(aiRef.currentStepIndex);
          aiRef.phase = "label"; // 回到選 Label 階段
        }
        // 重新計算剩下的 Label 或顯示當前的 Option
        updateStepState();
      } else {
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();
        const triggerIndex = text.lastIndexOf(trigger);
        if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        const space = getSmartSpace(textarea.value, chosen, false);
        textarea.value += space + chosen;
        const currentContent = textarea.value;
        resetAI();
        callAI(currentContent);
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") resetAI();
  });
}
