import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  if (!textarea || !overlay) return;

  // ── AI state ──────────────────────────────────────────────────────────────
  const aiRef = {
    type: null, steps: [], completedIndices: new Set(),
    currentStepIndex: null, phase: "label",
    options: [], activeIndex: 0, full: null,
    currentMapping: [], isCalling: false
  };

  let typingTimerFast = null;
  let typingTimerSlow = null;
  let currentController = null;

  // ── Undo / Redo — each entry stores full textarea + AI overlay state ────────
  const undoStack = [];
  const redoStack = [];

  function captureCurrentState() {
    return {
      value:              textarea.value,
      overlayHTML:        overlay.innerHTML,
      aiType:             aiRef.type,
      aiOptions:          [...(aiRef.options || [])],
      aiFull:             aiRef.full,
      aiActiveIndex:      aiRef.activeIndex,
      aiPhase:            aiRef.phase,
      aiCurrentStepIndex: aiRef.currentStepIndex,
      aiCurrentMapping:   [...(aiRef.currentMapping || [])],
      aiSteps:            JSON.parse(JSON.stringify(aiRef.steps || [])),
      aiCompletedIndices: [...aiRef.completedIndices]   // Set → array for storage
    };
  }

  function applyState(state) {
    textarea.value          = state.value;
    overlay.innerHTML       = state.overlayHTML;
    aiRef.isCalling         = false;
    aiRef.type              = state.aiType;
    aiRef.options           = [...(state.aiOptions || [])];
    aiRef.full              = state.aiFull;
    aiRef.activeIndex       = state.aiActiveIndex ?? 0;
    aiRef.phase             = state.aiPhase ?? "label";
    aiRef.currentStepIndex  = state.aiCurrentStepIndex ?? null;
    aiRef.currentMapping    = [...(state.aiCurrentMapping || [])];
    aiRef.steps             = JSON.parse(JSON.stringify(state.aiSteps || []));
    aiRef.completedIndices  = new Set(state.aiCompletedIndices || []);
    // Restore timer so the fast-accept guard works correctly for the restored suggestion
    suggestionShownAt = state.aiFull ? Date.now() : null;
  }

  function saveUndo() {
    undoStack.push(captureCurrentState());
    redoStack.length = 0;
  }

  // ── Config & feedback state ───────────────────────────────────────────────
  let maxTokens = 128;
  let lastPrompt = null;
  let lastAcceptedDelta = null;
  let hasAutoTriggered = false; // true after first auto-trigger; all further AI calls need Tab
  let waitForTab       = false; // after undo/redo, suppress auto-trigger until Tab pressed
  let pendingDislike    = null; // set on 👎; sent with desired_response on form save
  let currentScore      = null; // numeric score from last AI response
  let suggestionShownAt = null; // timestamp when the current suggestion was rendered

  // ── Inject controls to the right of the datetime input ───────────────────
  const copilotContainer = overlay.parentElement;

  const panel = document.createElement("div");
  panel.className = "ai-controls-panel";
  panel.innerHTML = `
    <span class="ai-ctrl-label">Token</span>
    <input type="range" class="ai-token-slider" min="16" max="512" step="16" value="${maxTokens}">
    <span class="ai-token-val">${maxTokens}</span>
    <span class="ai-ctrl-sep"></span>
    <span class="ai-score-badge"></span>
    <button type="button" class="ai-feedback-btn" data-fb="like"    title="讚"   disabled>👍</button>
    <button type="button" class="ai-feedback-btn" data-fb="dislike" title="倒讚" disabled>👎</button>`;

  const datetimeInput = document.getElementById("datetime");
  if (datetimeInput) {
    const datetimeLabel = datetimeInput.closest("label") || datetimeInput.parentElement;
    const wrapper = document.createElement("div");
    wrapper.className = "ai-datetime-row";
    datetimeLabel.parentNode.insertBefore(wrapper, datetimeLabel);
    wrapper.appendChild(datetimeLabel);
    wrapper.appendChild(panel);
  } else {
    copilotContainer.insertAdjacentElement("afterend", panel);
  }

  // ── Inject keyboard shortcuts hint below the textarea ────────────────────
  const hintsEl = document.createElement("p");
  hintsEl.className = "ai-shortcuts-hint";
  hintsEl.innerHTML =
    `<kbd>Tab</kbd> 補全 &ensp;` +
    `<kbd>↑↓</kbd> 切換選項 &ensp;` +
    `<kbd>Shift+R</kbd> 重新生成 &ensp;` +
    `<kbd>Ctrl+Z</kbd> 還原 &ensp;` +
    `<kbd>Ctrl+Y</kbd> 重做 &ensp;` +
    `<kbd>Esc</kbd> 清除`;
  copilotContainer.insertAdjacentElement("afterend", hintsEl);

  // ── Control element refs ──────────────────────────────────────────────────
  const sliderEl   = panel.querySelector(".ai-token-slider");
  const tokenValEl = panel.querySelector(".ai-token-val");
  const scoreBadge = panel.querySelector(".ai-score-badge");
  const likeBtn    = panel.querySelector("[data-fb='like']");
  const dislikeBtn = panel.querySelector("[data-fb='dislike']");

  sliderEl.addEventListener("input", () => {
    maxTokens = Number(sliderEl.value);
    tokenValEl.textContent = maxTokens;
  });
  likeBtn.addEventListener("click",    () => sendFeedback(true));
  dislikeBtn.addEventListener("click", () => sendFeedback(false));

  // Fetch default max_tokens from backend config
  apiFetch("/predict/config").then(cfg => {
    if (cfg?.max_tokens) {
      maxTokens = cfg.max_tokens;
      sliderEl.value = String(maxTokens);
      sliderEl.max   = String(Math.max(Number(sliderEl.max), maxTokens));
      tokenValEl.textContent = maxTokens;
    }
  }).catch(() => {});

  function setScore(score) {
    currentScore = score != null ? Number(score) : null;
    if (currentScore != null) {
      scoreBadge.textContent   = `分數：${currentScore}`;
      scoreBadge.style.display = "inline-block";
      // Low score: highlight badge in amber
      scoreBadge.style.background = currentScore < 60 ? "#fef3c7" : "#f1f5f9";
      scoreBadge.style.borderColor = currentScore < 60 ? "#fbbf24" : "#e2e8f0";
      scoreBadge.style.color       = currentScore < 60 ? "#92400e" : "#475569";
    } else {
      scoreBadge.style.display = "none";
    }
  }

  function setFeedbackEnabled(on) {
    likeBtn.disabled    = !on;
    dislikeBtn.disabled = !on;
  }

  // ── Toast notification ───────────────────────────────────────────────────
  function showToast(msg) {
    document.querySelectorAll(".ai-toast").forEach(t => t.remove());
    const toast = document.createElement("div");
    toast.className = "ai-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    // Double rAF ensures the initial opacity:0 is painted before transitioning in
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("ai-toast-visible")));
    setTimeout(() => {
      toast.classList.remove("ai-toast-visible");
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  function buildPayload(liked, desiredResponse = null) {
    const params    = new URLSearchParams(window.location.search);
    const patientId = params.get("pid") || params.get("id");
    return {
      nurse_id:         Number(localStorage.getItem("token")) || null,
      patient_id:       patientId ? Number(patientId) : null,
      context:          lastPrompt,
      response:         lastAcceptedDelta,
      desired_response: desiredResponse,
      liked
    };
  }

  async function sendFeedback(liked) {
    if (!lastPrompt || !lastAcceptedDelta) return;

    if (liked) {
      // ── 👍: cancel any pending dislike, send immediately ─────────────────
      if (pendingDislike) {
        pendingDislike = null;
        dislikeBtn.classList.remove("ai-feedback-pending");
      }
      likeBtn.classList.add("ai-feedback-active");
      setTimeout(() => likeBtn.classList.remove("ai-feedback-active"), 1400);
      showToast("謝謝你的回饋，你一個小小的動作都可以改善我們的系統！");
      try {
        await apiFetch("/feedback", { method: "POST", body: JSON.stringify(buildPayload(true)) });
      } catch (err) { console.error("Feedback error:", err); }

    } else {
      // ── 👎: confirm intent → store locally → POST once when form saves ───
      const confirmed = window.confirm(
        "確認標記此 AI 建議為不滿意？\n\n請確認後修改內容，再按儲存，系統將記錄您的修改作為改進參考。"
      );
      if (!confirmed) return;

      pendingDislike = buildPayload(false);  // snapshot: context + bad response
      dislikeBtn.classList.add("ai-feedback-pending");
      showToast("不滿意已標記！請修改內容後按儲存，系統將一併記錄。");
    }
  }

  // On form save: send one POST with the satisfied result (what user ended up writing)
  const form = textarea.closest("form");
  if (form) {
    form.addEventListener("submit", () => {
      if (!pendingDislike) return;
      const payload = { ...pendingDislike, desired_response: textarea.value };
      pendingDislike = null;
      dislikeBtn.classList.remove("ai-feedback-pending");
      apiFetch("/feedback", { method: "POST", body: JSON.stringify(payload) })
        .catch(err => console.error("Feedback error:", err));
    });
  }

  // ── Overlay renderer ──────────────────────────────────────────────────────
  function renderOverlay(prefix, suggestion) {
    if (aiRef.isCalling) {
      overlay.innerHTML = `
        <span style="color: transparent;">${prefix}</span>
        <span style="color: #999; font-style: italic;">正在 AI 補全...</span>`;
      return;
    }
    if (!suggestion) { overlay.innerHTML = ""; suggestionShownAt = null; return; }
    let displaySuggestion = suggestion;
    if (aiRef.type !== "multi-step-options" && suggestion.startsWith(prefix)) {
      displaySuggestion = suggestion.slice(prefix.length);
    }
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${displaySuggestion}</span>`;
    suggestionShownAt = Date.now(); // record when the suggestion first appeared
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetAI() {
    aiRef.isCalling = false;
    aiRef.type = null;
    aiRef.steps = [];
    aiRef.completedIndices.clear();
    aiRef.currentStepIndex = null;
    aiRef.phase = "label";
    aiRef.options = [];
    aiRef.activeIndex = 0;
    aiRef.full = null;
    overlay.innerHTML = "";
    suggestionShownAt = null;
    currentScore = null;
    setScore(null);
  }

  function isChinese(char) { return /[一-龥]/.test(char); }

  function getSmartSpace(prevText, nextText, forceSpace = false) {
    if (!prevText || !nextText) return "";
    const lastChar  = prevText.slice(-1);
    const firstChar = nextText[0];
    if (/\s/.test(lastChar)) return "";
    const punctuation = ".,;!?，。；！？、：:()[]{} \n";
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
      .replace(/\bxxxx\/xx\/xx xx:xx\b/gi,    `${dateSlash} ${timeHHMM}`)
      .replace(/\bxx:xx\b/gi,                  timeHHMM);
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
      aiRef.options        = remainingSteps.map(s => s.label);
      aiRef.currentMapping = remainingSteps.map(s => s.originalIndex);
    } else {
      const currentStep = aiRef.steps[aiRef.currentStepIndex];
      if (currentStep) {
        let finalOptions = [...currentStep.options];
        const bmiData = calculateRawBMI();
        if (bmiData && currentStep.label.includes("BMI")) {
          if (currentStep.label.includes("BMI值")) {
            finalOptions = [`：${bmiData}`];
          } else if (currentStep.label.includes("BMI結果")) {
            let index = 1;
            if      (bmiData < 18.5)                    index = 0;
            else if (bmiData >= 24 && bmiData < 27)     index = 1;
            else if (bmiData >= 27 && bmiData < 30)     index = 2;
            else if (bmiData >= 30)                     index = 3;
            if (finalOptions[index]) finalOptions = [finalOptions[index]];
          }
        }
        aiRef.options = finalOptions.map(opt => replaceTimeWithInput(opt));
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

  function calculateRawBMI() {
    const text        = textarea.value;
    const weightMatch = text.match(/體重\s*[:：]?\s*(\d+(\.\d+)?)/);
    const heightMatch = text.match(/身高\s*[:：]?\s*(\d+(\.\d+)?)/);
    if (weightMatch && heightMatch) {
      const w = parseFloat(weightMatch[1]);
      const h = parseFloat(heightMatch[1]) / 100;
      return (w / (h * h)).toFixed(1);
    }
    return null;
  }

  async function callAI(prompt) {
    const params    = new URLSearchParams(window.location.search);
    const patientId = params.get("pid") || params.get("id");
    if (!patientId) { resetAI(); return; }

    hasAutoTriggered = true; // first AI call marks end of auto-trigger mode
    if (currentController) currentController.abort();
    currentController = new AbortController();
    aiRef.isCalling = true;
    renderOverlay(textarea.value, null);

    try {
      const res = await apiFetch("/predict", {
        method: "POST",
        body: JSON.stringify({ prompt, patient_id: patientId, max_tokens: maxTokens }),
        signal: currentController.signal
      });
      currentController = null;
      aiRef.isCalling = false;

      if (!res.completions?.length) { resetAI(); return; }

      lastPrompt = prompt;

      const skill = res.completions[0];
      aiRef.type  = skill.type;

      // Score only for regular completions; fixed-format templates don't have a meaningful score
      const score = skill.type !== "multi-step-options"
        ? (res.score ?? skill.score ?? null)
        : null;
      setScore(score);

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.completedIndices.clear();
        const trimmedPrompt = prompt.trim();
        const firstLabel    = skill.steps[0].label;
        if (trimmedPrompt === firstLabel || trimmedPrompt.endsWith(firstLabel)) {
          aiRef.completedIndices.add(0);
          aiRef.currentStepIndex = 0;
          aiRef.phase = "option";
        } else {
          aiRef.phase = "label";
        }
        updateStepState();
      } else {
        aiRef.options     = (skill.options || skill.candidates || [skill.full || skill.text || ""])
          .map(o => replaceTimeWithInput(o));
        aiRef.activeIndex = 0;
        aiRef.full        = aiRef.options[0];
        renderOverlay(prompt, aiRef.full);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("AI Error:", err);
      aiRef.isCalling = false;
      resetAI();
    }
  }

  // ── Input listener ────────────────────────────────────────────────────────
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimerFast);
    clearTimeout(typingTimerSlow);

    const text     = textarea.value;
    const lastChar = text.slice(-1);

    if (lastChar === "\n") { resetAI(); waitForTab = false; return; }
    if (!text.trim())      { resetAI(); waitForTab = false; return; }

    // After undo/redo: clear ghost text, no auto-trigger
    if (waitForTab) {
      resetAI();
      return;
    }

    // After first auto-trigger: all AI calls require Tab — never auto-trigger again
    if (hasAutoTriggered) {
      if (aiRef.type === "multi-step-options") renderOverlay(text, aiRef.full);
      return;
    }

    // ── First-time auto-trigger only ────────────────────────────────────────
    if (aiRef.type === "multi-step-options") { renderOverlay(text, aiRef.full); return; }

    typingTimerFast = setTimeout(() => {
      clearTimeout(typingTimerSlow);
      callAI(text);
    }, 300);

    typingTimerSlow = setTimeout(() => {
      clearTimeout(typingTimerFast);
      callAI(text);
    }, 800);
  });

  // ── Keydown listener ──────────────────────────────────────────────────────
  textarea.addEventListener("keydown", (e) => {

    // ── Input lock: while generating or suggestion visible, only 4 keys allowed ──
    if (aiRef.isCalling || aiRef.options?.length) {
      const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(e.key);
      const isAllowed  = isModifier
        || e.key === "Escape"
        || e.key === "Tab"
        || e.key === "ArrowUp"
        || e.key === "ArrowDown"
        || (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r");
      if (!isAllowed) { e.preventDefault(); return; }
    }

    // Ctrl+Z / Cmd+Z — undo last Tab completion, restore saved ghost text
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
      e.preventDefault();
      if (undoStack.length > 0) {
        redoStack.push(captureCurrentState());
        applyState(undoStack.pop());
        waitForTab = true; // require explicit Tab to trigger next AI call
      }
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z — redo, restore saved ghost text
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      if (redoStack.length > 0) {
        undoStack.push(captureCurrentState());
        applyState(redoStack.pop());
        waitForTab = true;
      }
      return;
    }

    // Shift+R — regenerate (abort current, call AI again)
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r") {
      e.preventDefault(); // always prevent "R" from typing
      if (textarea.value.trim()) {
        if (currentController) { currentController.abort(); currentController = null; }
        resetAI();
        callAI(textarea.value);
      }
      return;
    }

    // Arrow up / down — cycle through options
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!aiRef.options?.length) return;
      e.preventDefault();
      const dir         = (e.key === "ArrowDown") ? 1 : -1;
      aiRef.activeIndex = (aiRef.activeIndex + dir + aiRef.options.length) % aiRef.options.length;
      aiRef.full        = aiRef.options[aiRef.activeIndex];
      renderOverlay(textarea.value, aiRef.full);
      return;
    }

    // Tab — accept suggestion; or trigger AI when needed
    if (e.key === "Tab") {
      e.preventDefault();

      // No ghost text showing: call AI if allowed
      if (!aiRef.options?.length) {
        if (!hasAutoTriggered) return; // before first auto-trigger, Tab does nothing here
        waitForTab = false;
        callAI(textarea.value);
        return;
      }
      // Ghost text present: fall through to accept it
      // (if waitForTab, it stays true so typing after acceptance still requires Tab)

      const chosen = aiRef.full;
      if (!chosen) return;

      // ── Confirmation guard: only for regular completions, NOT fixed-format templates
      if (aiRef.type !== "multi-step-options") {
        const isTooFast  = suggestionShownAt != null && (Date.now() - suggestionShownAt < 1000);
        const isLowScore = currentScore != null && currentScore < 60;
        if (isTooFast || isLowScore) {
          const reasons = [];
          if (isTooFast)  reasons.push("確認速度過快（建議仔細閱讀）");
          if (isLowScore) reasons.push(`AI 信心分數較低（${currentScore} 分）`);
          const preview = chosen.length > 80 ? chosen.slice(0, 80) + "…" : chosen;
          const ok = window.confirm(
            `⚠️ 請確認內容是否正確\n\n原因：${reasons.join("、")}\n\n補全內容：\n"${preview}"\n\n確定接受此補全？`
          );
          if (!ok) return;
        }
      }

      saveUndo();
      const beforeValue = textarea.value;

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

        const delta = textarea.value.slice(beforeValue.length);
        if (delta) {
          lastAcceptedDelta = delta;
          setFeedbackEnabled(true);
        }

        updateStepState();

      } else {
        const text    = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();

        const needsReplace = ["trigger-prefix", "trigger-multi-prefix"].includes(aiRef.type);
        if (needsReplace) {
          const triggerIndex = text.lastIndexOf(trigger);
          if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        }

        const space = getSmartSpace(textarea.value, chosen, false);
        textarea.value += space + chosen;

        lastAcceptedDelta = textarea.value.slice(beforeValue.length);
        setFeedbackEnabled(true);

        resetAI();
      }

      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") {
      if (currentController) { currentController.abort(); currentController = null; }
      resetAI();
      waitForTab = false;
    }
  });
}
