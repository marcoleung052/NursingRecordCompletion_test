import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    full: null,        // ⭐ 保存完整句子（fixed-sequence / multi-options）
    steps: null,
    stepIndex: 0,
    options: [],
    activeIndex: 0
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100;

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
  // input：每次輸入都要重新 render prefix 補全
  // ---------------------------
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;

    // ⭐ 如果是 prefix 補全 → 直接重新 render，不用 callAI
    if (aiRef.type === "fixed-sequence" || aiRef.type === "multi-options") {
      if (aiRef.full) {
        renderOverlay(text, aiRef.full);
        return;
      }
    }

    if (!text.trim()) {
      overlay.innerHTML = "";
      resetAI();
      return;
    }

    typingTimer = setTimeout(() => callAI(text), FRONTEND_DELAY);
  });

  // ---------------------------
  // 呼叫後端
  // ---------------------------
  async function callAI(prompt) {
    renderOverlay(prompt, "(正在補全…)");

    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });

    const skill = res.completions[0];
    aiRef.type = skill.type;

    // ---------------------------
    // trigger-prefix → prefix 補全
    // ---------------------------
    if (skill.type === "trigger-prefix") {
      aiRef.full = skill.full;
      aiRef.options = [skill.full];   // ⭐⭐ 這行最重要
      aiRef.activeIndex = 0;
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // fixed-sequence → prefix 補全
    // ---------------------------
    if (skill.type === "fixed-sequence") {
      aiRef.full = skill.text;   // ⭐ 保存完整句子
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // multi-options → prefix 補全
    // ---------------------------
    if (skill.type === "multi-options") {
      aiRef.options = skill.options;
      aiRef.full = aiRef.options[0];  // ⭐ 保存完整句子
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // multi-step-options
    // ---------------------------
    if (skill.type === "multi-step-options") {
      aiRef.steps = skill.steps;
      aiRef.stepIndex = 0;
      aiRef.options = aiRef.steps[0].options;
      aiRef.full = aiRef.options[0];
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // ai-multi-options
    // ---------------------------
    if (skill.type === "ai-multi-options") {
      aiRef.options = skill.options;
      aiRef.full = aiRef.options[0];
      renderOverlay(prompt, aiRef.full);
      return;
    }
  }

  // ---------------------------
  // keydown：上下鍵 + Tab
  // ---------------------------
  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options || aiRef.options.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      aiRef.activeIndex = (aiRef.activeIndex + 1) % aiRef.options.length;
      aiRef.full = aiRef.options[aiRef.activeIndex];
      renderOverlay(textarea.value, aiRef.full);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      aiRef.activeIndex =
        (aiRef.activeIndex - 1 + aiRef.options.length) % aiRef.options.length;
      aiRef.full = aiRef.options[aiRef.activeIndex];
      renderOverlay(textarea.value, aiRef.full);
    }

    if (e.key === "Tab") {
      e.preventDefault();

      const full = aiRef.full;
      const text = textarea.value;
      const trigger = text.split(/[\s\n]/).pop();

      const toInsert = full.startsWith(trigger)
        ? full.slice(trigger.length)
        : full;

      insertAtCursor(textarea, toInsert);
      overlay.innerHTML = "";

      textarea.dispatchEvent(new Event("input"));

      if (aiRef.type === "multi-step-options") {
        aiRef.stepIndex++;
        if (aiRef.stepIndex < aiRef.steps.length) {
          aiRef.options = aiRef.steps[aiRef.stepIndex].options;
          aiRef.activeIndex = 0;
          aiRef.full = aiRef.options[0];
          renderOverlay(textarea.value, aiRef.full);
        } else {
          resetAI();
        }
        return;
      }

      resetAI();
    }
  });

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    textarea.value = before + text + after;

    const newPos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
  }

  function resetAI() {
    aiRef.type = null;
    aiRef.full = null;
    aiRef.steps = null;
    aiRef.stepIndex = 0;
    aiRef.options = [];
    aiRef.activeIndex = 0;
  }
}
