import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    steps: null,
    stepIndex: 0,
    phase: "label", // "label" 或 "option"
    options: [],
    activeIndex: 0,
    full: null
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100;

  // ---------------------------
  // 核心工具函式
  // ---------------------------

  function renderOverlay(prefix, suggestion) {
    if (!suggestion) {
      overlay.innerHTML = "";
      return;
    }

    // 計算建議文字：如果是多步模式，suggestion 直接接在後面
    // 如果是單步模式且 suggestion 開頭包含 prefix，則只顯示剩餘部分
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
    aiRef.steps = null;
    aiRef.stepIndex = 0;
    aiRef.phase = "label";
    aiRef.options = [];
    aiRef.activeIndex = 0;
    aiRef.full = null;
    overlay.innerHTML = "";
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

  function getPrefixSpace(currentVal) {
    if (!currentVal) return "";
    const lastChar = currentVal.slice(-1);
    const punctuation = ".,;!?，。；！？、 \n";
    return punctuation.includes(lastChar) ? "" : " ";
  }

  function updateStepState() {
    const currentStep = aiRef.steps[aiRef.stepIndex];
    if (!currentStep) {
      resetAI();
      return;
    }

    if (aiRef.phase === "label") {
      if (!currentStep.label || currentStep.label.trim() === "") {
        aiRef.phase = "option";
        updateStepState();
        return;
      }
      aiRef.options = [currentStep.label];
    } else {
      aiRef.options = currentStep.options.map(opt => replaceTimeWithInput(opt));
    }

    aiRef.activeIndex = 0;
    aiRef.full = aiRef.options[0];
    renderOverlay(textarea.value, aiRef.full);
  }

  // ---------------------------
  // 異步處理
  // ---------------------------

  async function callAI(prompt) {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("id");

    try {
      const res = await apiFetch("/api/predict", {
        method: "POST",
        body: JSON.stringify({ prompt, patient_id: patientId })
      });

      if (!res.completions?.length) return;
      const skill = res.completions[0];
      aiRef.type = skill.type;

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.stepIndex = 0;
        aiRef.phase = "label";
        updateStepState();
      } else {
        // 處理單步模式
        aiRef.options = (skill.options || skill.candidates || [skill.full || skill.text || ""])
          .map(o => replaceTimeWithInput(o));
        aiRef.activeIndex = 0;
        aiRef.full = aiRef.options[0];
        renderOverlay(prompt, aiRef.full);
      }
    } catch (err) {
      console.error("AI Fetch Error:", err);
      resetAI();
    }
  }

  // ---------------------------
  // 事件監聽
  // ---------------------------

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
        // 插入 Label 或 Option
        textarea.value += getPrefixSpace(textarea.value) + chosen;
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

        // 切換狀態
        if (aiRef.phase === "label") {
          aiRef.phase = "option";
        } else {
          aiRef.stepIndex++;
          aiRef.phase = "label";
        }
        updateStepState();
      } else {
        // 單步模式：刪除末端 trigger 後插入
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();
        const triggerIndex = text.lastIndexOf(trigger);
        if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        
        textarea.value += getPrefixSpace(textarea.value) + chosen;
        resetAI();
      }
    }

    if (e.key === "Escape") resetAI();
  });
}
