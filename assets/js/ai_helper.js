import { 
  getManualCompletion,
  renderManualCompletion,
  handleAfterManualAccept,
  insertAtCursor
} from "./manual_helper.js";

import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = { value: [], activeIndex: 0, meta: null };
  let typingTimer = null;
  const delay = 800;

  function renderOverlay(prefix, suffix) {
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suffix}</span>
    `;
  }

  // ---------------------------
  // input：先手動 → 再 AI
  // ---------------------------
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    // ⭐ 先手動補全
    const manualResult = getManualCompletion(text);
    if (manualResult) {
      renderManualCompletion(text, overlay, aiRef, manualResult);
      aiRef.activeIndex = 0;
      return;   // ⭐ 不符合手動才會跑 AI
    }

    // ⭐ fallback → AI 補全
    typingTimer = setTimeout(() => callAI(text), delay);
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
    aiRef.meta = { kind: "ai" };

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
      // ⭐ 取得觸發字（最後一個 token）
      const trigger = textarea.value.split(/[\s\n]/).pop();
      // ⭐ 刪掉觸發字
      const start = textarea.selectionStart;
    const before = textarea.value.slice(0, start - trigger.length);
    const after = textarea.value.slice(start);
    
    textarea.value = before + full + after;

    // ⭐ 更新游標位置
    const newPos = before.length + full.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;

    overlay.innerHTML = "";

    // ⭐ 手動補全 → 自動跳下一個
    if (aiRef.meta && aiRef.meta.kind !== "ai") {
      handleAfterManualAccept(textarea, overlay, aiRef);
    } else {
      aiRef.value = [];
      aiRef.meta = null;
    }

    }
  });
}
