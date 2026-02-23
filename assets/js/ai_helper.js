import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    steps: [],
    completedIndices: new Set(), // 記錄哪些 step 已經完成
    currentStepIndex: null,      // 當前選中的 step
    phase: "label",              // "label" 或 "option"
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
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suggestion}</span>
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

  // 關鍵：更新狀態以顯示「剩餘所有 Label」或「當前 Option」
  function updateStepState() {
    // 找出所有尚未完成的 steps
    const remainingSteps = aiRef.steps
      .map((s, idx) => ({ ...s, originalIndex: idx }))
      .filter(s => !aiRef.completedIndices.has(s.originalIndex));

    if (remainingSteps.length === 0) {
      resetAI();
      return;
    }

    if (aiRef.phase === "label") {
      // 顯示所有剩餘步驟的 Label
      aiRef.options = remainingSteps.map(s => s.label);
      // 綁定原始索引以便後續找 options
      aiRef.currentMapping = remainingSteps.map(s => s.originalIndex);
    } else {
      // 顯示當前選中 Step 的所有 Options
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

      if (!res.completions?.length) return;
      const skill = res.completions[0];
      aiRef.type = skill.type;

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.completedIndices.clear();
        
        // 檢查輸入是否剛好匹配第一個 label (如 "Admitted")
        if (prompt.trim().endsWith(skill.steps[0].label)) {
          aiRef.completedIndices.add(0); // 標記第一個已完成 (或部分完成)
          aiRef.currentStepIndex = 0;
          aiRef.phase = "option"; // 直接選內容
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
        if (aiRef.phase === "label") {
          // 1. 選中了某個 Label
          textarea.value += chosen;
          // 找出這個 Label 對應的原始 Step Index
          aiRef.currentStepIndex = aiRef.currentMapping[aiRef.activeIndex];
          aiRef.phase = "option"; // 進入選 Option 階段
        } else {
          // 2. 選中了某個 Option
          textarea.value += chosen;
          // 標記該步驟已完成
          aiRef.completedIndices.add(aiRef.currentStepIndex);
          aiRef.phase = "label"; // 回到選 Label 階段，顯示剩餘的
        }
        updateStepState();
      } else {
        // 單步模式
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();
        const triggerIndex = text.lastIndexOf(trigger);
        if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        textarea.value += chosen;
        resetAI();
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") resetAI();
  });
}
