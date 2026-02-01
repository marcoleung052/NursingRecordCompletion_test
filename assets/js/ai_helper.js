import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,        // skill type
    steps: null,       // for multi-step-options
    stepIndex: 0,      // current step
    options: [],       // current options
    activeIndex: 0     // highlight index
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100; // 0.1 秒 debounce

  function renderOverlay(prefix, full) {
    const suffix = full.startsWith(prefix)
      ? full.slice(prefix.length)
      : full;

    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suffix}</span>
    `;
  }

  // ---------------------------
  // input：呼叫後端 agent
  // ---------------------------
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      resetAI();
      return;
    }

    typingTimer = setTimeout(() => callAI(text), FRONTEND_DELAY);
  });

  // ---------------------------
  // 呼叫後端 API
  // ---------------------------
  async function callAI(prompt) {
    renderOverlay(prompt, "(正在補全…)");

    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });

    const skill = res.completions; // 後端回傳 dict

    aiRef.type = skill.type;

    // ---------------------------
    // TYPE: ai-multi-options
    // ---------------------------
    if (skill.type === "ai-multi-options") {
      aiRef.options = skill.options;
      aiRef.activeIndex = 0;

      const full = aiRef.options[0] || prompt;
      renderOverlay(prompt, full.slice(prompt.length));
      return;
    }

    // ---------------------------
    // TYPE: multi-options
    // ---------------------------
    if (skill.type === "multi-options") {
      aiRef.options = skill.options;
      aiRef.activeIndex = 0;

      const full = aiRef.options[0];
      renderOverlay(prompt, full);
      return;
    }

    // ---------------------------
    // TYPE: fixed-sequence
    // ---------------------------
    if (skill.type === "fixed-sequence") {
      insertAtCursor(textarea, skill.text);
      overlay.innerHTML = "";
      resetAI();
      return;
    }

    // ---------------------------
    // TYPE: multi-step-options
    // ---------------------------
    if (skill.type === "multi-step-options") {
      aiRef.steps = skill.steps;
      aiRef.stepIndex = 0;
      aiRef.options = aiRef.steps[0].options;
      aiRef.activeIndex = 0;

      const full = aiRef.options[0];
      renderOverlay(prompt, full);
      return;
    }
  }

  // ---------------------------
  // keydown：上下鍵 + Tab
  // ---------------------------
  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options || aiRef.options.length === 0) return;

    // 上下鍵切換候選
    if (e.key === "ArrowDown") {
      e.preventDefault();
      aiRef.activeIndex = (aiRef.activeIndex + 1) % aiRef.options.length;
      renderOverlay(textarea.value, aiRef.options[aiRef.activeIndex]);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      aiRef.activeIndex =
        (aiRef.activeIndex - 1 + aiRef.options.length) % aiRef.options.length;
      renderOverlay(textarea.value, aiRef.options[aiRef.activeIndex]);
    }

    // Tab → 插入
    if (e.key === "Tab") {
      e.preventDefault();

      const full = aiRef.options[aiRef.activeIndex];
      const text = textarea.value;
      const trigger = text.split(/[\s\n]/).pop();

      const toInsert = full.startsWith(trigger)
        ? full.slice(trigger.length)
        : full;

      insertAtCursor(textarea, toInsert);
      overlay.innerHTML = "";

      // ---------------------------
      // multi-step-options → 下一步
      // ---------------------------
      if (aiRef.type === "multi-step-options") {
        aiRef.stepIndex++;

        if (aiRef.stepIndex < aiRef.steps.length) {
          aiRef.options = aiRef.steps[aiRef.stepIndex].options;
          aiRef.activeIndex = 0;

          const nextFull = aiRef.options[0];
          renderOverlay(textarea.value, nextFull);
        } else {
          resetAI();
        }
        return;
      }

      // 其他類型 → 清空
      resetAI();
    }
  });

  // ---------------------------
  // 工具：插入文字
  // ---------------------------
  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    textarea.value = before + text + after;

    const newPos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
  }

  // ---------------------------
  // 工具：重置 AI 狀態
  // ---------------------------
  function resetAI() {
    aiRef.type = null;
    aiRef.steps = null;
    aiRef.stepIndex = 0;
    aiRef.options = [];
    aiRef.activeIndex = 0;
  }
}
