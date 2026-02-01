import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = { value: [], activeIndex: 0 };
  let typingTimer = null;

  // ⭐ 前端 debounce：0.1 秒
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
  // input：直接 AI 補全（無手動）
  // ---------------------------
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      aiRef.value = [];
      return;
    }

    typingTimer = setTimeout(() => callAI(text), FRONTEND_DELAY);
  });

  // ---------------------------
  // AI 補全
  // ---------------------------
  async function callAI(prompt) {
    renderOverlay(prompt, "(正在補全…)");

    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });

    aiRef.value = res.completions || [];
    aiRef.activeIndex = 0;

    const full = aiRef.value[0] || prompt;
    const suffix = full.slice(prompt.length);
    renderOverlay(prompt, suffix);
  }

  // ---------------------------
  // keydown：上下鍵 + Tab
  // ---------------------------
  textarea.addEventListener("keydown", (e) => {
    if (aiRef.value.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      aiRef.activeIndex = (aiRef.activeIndex + 1) % aiRef.value.length;
      renderOverlay(textarea.value, aiRef.value[aiRef.activeIndex]);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      aiRef.activeIndex = (aiRef.activeIndex - 1 + aiRef.value.length) % aiRef.value.length;
      renderOverlay(textarea.value, aiRef.value[aiRef.activeIndex]);
    }

    if (e.key === "Tab") {
      e.preventDefault();

      const full = aiRef.value[aiRef.activeIndex];
      const text = textarea.value;
      const trigger = text.split(/[\s\n]/).pop();

      const toInsert = full.startsWith(trigger)
        ? full.slice(trigger.length)
        : full;

      insertAtCursor(textarea, toInsert);
      overlay.innerHTML = "";

      aiRef.value = [];
    }
  });
}

// ⭐ 內建 insertAtCursor（不再依賴 manual_helper.js）
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  textarea.value = before + text + after;

  const newPos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;
}
