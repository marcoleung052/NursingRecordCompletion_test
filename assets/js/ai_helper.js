import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  if (!textarea || !overlay) return;

  let suggestions = [];
  let activeIndex = 0;
  let isLoading = false;
  let typingTimer = null;
  const delay = 800;

  async function callAI(prompt) {
    isLoading = true;
    renderOverlay(prompt, "(正在補全…)");

    try {
      const res = await apiFetch("/api/predict", {
        method: "POST",
        body: JSON.stringify({ prompt })
      });

      suggestions = res.completions;
      activeIndex = 0;

      const full = suggestions[0] || prompt;
      const suffix = full.slice(prompt.length);

      renderOverlay(prompt, suffix);
    } catch (err) {
      renderOverlay(prompt, "");
    }

    isLoading = false;
  }

  function renderOverlay(prefix, suffix) {
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suffix}</span>
    `;
  }

  function acceptSuggestion() {
    const base = textarea.value;
    const full = suggestions[activeIndex] || base;
    textarea.value = full;
    renderOverlay(full, "");
  }

  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      return;
    }

    typingTimer = setTimeout(() => {
      callAI(text);
    }, delay);
  });

  textarea.addEventListener("keydown", (e) => {
    if (suggestions.length === 0 || isLoading) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;

      const full = suggestions[activeIndex];
      const suffix = full.slice(textarea.value.length);
      renderOverlay(textarea.value, suffix);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;

      const full = suggestions[activeIndex];
      const suffix = full.slice(textarea.value.length);
      renderOverlay(textarea.value, suffix);
    }

    if (e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion();
    }
  });
}
