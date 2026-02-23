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
    full: null
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100;

  function renderOverlay(prefix, suggestion) {
    if (!suggestion) {
      overlay.innerHTML = "";
      return;
    }
    let displaySuggestion = suggestion;
    // 非多步模式且建議包含 prefix 時，切掉重複部分
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

  // 判斷是否為中文的工具函式
  function isChinese(char) {
    return /[\u4e00-\u9fa5]/.test(char);
  }

  // 智慧間距邏輯
  function getSmartSpace(prevText, nextText) {
    if (!prevText || !nextText) return "";
    const lastChar = prevText.slice(-1);
    const firstChar = nextText[0];
    
    // 如果最後一個是標點符號，不加空白
    const punctuation = ".,;!?，。；！？、 \n";
    if (punctuation.includes(lastChar)) return "";

    // 規則：只有「中接中」才不加空白，其餘（中接英、英接中、英接英）皆加空白
    if (isChinese(lastChar) && isChinese(firstChar)) {
      return "";
    }
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

    if (remainingSteps.length === 0) {
      resetAI();
      return;
    }

    if (aiRef.phase === "label") {
      aiRef.options = remainingSteps.map(s => s.label);
      aiRef.currentMapping = remainingSteps.map(s => s.originalIndex);
    } else {
      const currentStep = aiRef.steps[aiRef.currentStepIndex];
      aiRef.options = currentStep.options.map(opt => replaceTimeWithInput(opt));
    }

    aiRef.activeIndex = 0;
    aiRef.full = aiRef.options[0];
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
        
        // 檢查輸入是否剛好匹配第一個 label
        if (prompt.trim().endsWith(skill.steps[0].label)) {
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
    if (aiRef.type === "multi-step-options") {
      renderOverlay(textarea.value, aiRef.full);
      return;
    }
    if (!textarea.value.trim()) { resetAI(); return; }
    typingTimer = setTimeout(() => callAI(textarea.value), FRONTEND_DELAY);
  });

  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options.length) return;

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

      if (aiRef.type === "multi-step-options") {
        // 使用智慧間距
        const space = getSmartSpace(textarea.value, chosen);
        textarea.value += space + chosen;
        
        if (aiRef.phase === "label") {
          aiRef.currentStepIndex = aiRef.currentMapping[aiRef.activeIndex];
          aiRef.phase = "option";
        } else {
          aiRef.completedIndices.add(aiRef.currentStepIndex);
          aiRef.phase = "label";
        }
        updateStepState();
      } else {
        // 單步模式補全
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();
        const triggerIndex = text.lastIndexOf(trigger);
        if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        
        // 補全後智慧間距
        const space = getSmartSpace(textarea.value, chosen);
        textarea.value += space + chosen;
        
        // 補全後立即觸發 AI 檢查是否有後續的 multi-step
        const currentContent = textarea.value;
        resetAI(); // 先清空舊狀態
        callAI(currentContent); // 立即檢查
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") resetAI();
  });
}
