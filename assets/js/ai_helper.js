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

  // --- 內部工具函式 ---

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
    const lastChar = prevText.slice(-1);
    const firstChar = nextText[0];
    if (/\s/.test(lastChar)) return "";
    const punctuation = ".,;!?，。；！？、：:()（）【】[]{} \n";
    if (punctuation.includes(lastChar) || punctuation.includes(firstChar)) return "";
    if (forceSpace) return " ";
    if (isChinese(lastChar) && isChinese(firstChar)) return "";
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

  // ⭐ BMI 計算邏輯：從現有文字提取數值並計算結果
  function getBMIData() {
    const text = textarea.value;
    // 支援：體重 70、體重:70、體重： 70.5 等格式
    const weightMatch = text.match(/體重\s*[:：]?\s*(\d+(\.\d+)?)/);
    const heightMatch = text.match(/身高\s*[:：]?\s*(\d+(\.\d+)?)/);

    if (weightMatch && heightMatch) {
      const weight = parseFloat(weightMatch[1]);
      const height = parseFloat(heightMatch[1]) / 100; // cm -> m
      if (height > 0) {
        const bmi = (weight / (height * height)).toFixed(1);
        let result = "正常範圍";
        if (bmi < 18.5) result = "體重過輕";
        else if (bmi >= 24 && bmi < 27) result = "過重";
        else if (bmi >= 27 && bmi < 30) result = "輕度肥胖";
        else if (bmi >= 30 && bmi < 35) result = "中度肥胖";
        else if (bmi >= 35) result = "重度肥胖";
        
        return { bmi: `：${bmi}`, result: `：${result}` };
      }
    }
    return null;
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
        let options = currentStep.options;

        // ⭐ BMI 動態攔截：如果當前步驟是 BMI 相關，直接計算並替換選項
        const bmiData = getBMIData();
        if (bmiData) {
          if (currentStep.label.includes("BMI值")) {
            options = [bmiData.bmi];
          } else if (currentStep.label.includes("BMI結果")) {
            options = [bmiData.result];
          }
        }

        aiRef.options = options.map(opt => replaceTimeWithInput(opt));
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

  // --- API 與 事件處理 ---

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

        const trimmedPrompt = prompt.trim();
        const firstLabel = skill.steps[0].label;
        
        if (trimmedPrompt === firstLabel || trimmedPrompt.endsWith(firstLabel)) {
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
