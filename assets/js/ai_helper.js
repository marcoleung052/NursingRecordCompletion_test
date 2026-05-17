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

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undoStack = [];
  const redoStack = [];

  function saveUndo() {
    undoStack.push(textarea.value);
    redoStack.length = 0;
  }

  // ── Config & feedback state ───────────────────────────────────────────────
  let maxTokens = 128;
  let lastPrompt = null;
  let lastAcceptedDelta = null;
  let justAccepted = false;

  // ── Inject controls panel below .copilot-container ───────────────────────
  const copilotContainer = overlay.parentElement;
  const panel = document.createElement("div");
  panel.className = "ai-controls-panel";
  panel.innerHTML = `
    <div class="ai-token-row">
      <span class="ai-ctrl-label">Token</span>
      <input type="range" class="ai-token-slider" min="16" max="512" step="16" value="${maxTokens}">
      <span class="ai-token-val">${maxTokens}</span>
    </div>
    <div class="ai-feedback-row">
      <span class="ai-score-badge"></span>
      <button type="button" class="ai-feedback-btn" data-fb="like"    title="讚"   disabled>👍</button>
      <button type="button" class="ai-feedback-btn" data-fb="dislike" title="倒讚" disabled>👎</button>
    </div>`;
  copilotContainer.insertAdjacentElement("afterend", panel);

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

  // Fetch default max_tokens from backend
  apiFetch("/predict/config").then(cfg => {
    if (cfg?.max_tokens) {
      maxTokens = cfg.max_tokens;
      sliderEl.value = String(maxTokens);
      sliderEl.max   = String(Math.max(Number(sliderEl.max), maxTokens));
      tokenValEl.textContent = maxTokens;
    }
  }).catch(() => {});

  function setScore(score) {
    if (score != null) {
      scoreBadge.textContent = `分數：${score}`;
      scoreBadge.style.display = "";
    } else {
      scoreBadge.style.display = "none";
    }
  }

  function setFeedbackEnabled(on) {
    likeBtn.disabled    = !on;
    dislikeBtn.disabled = !on;
  }

  async function sendFeedback(liked) {
    if (!lastPrompt || !lastAcceptedDelta) return;
    const params    = new URLSearchParams(window.location.search);
    const patientId = params.get("pid") || params.get("id");
    const nurseId   = Number(localStorage.getItem("token")) || null;

    let desiredResponse = null;
    if (!liked) {
      desiredResponse = window.prompt("請輸入您期望的正確回答（可留空）：") ?? "";
    }

    try {
      await apiFetch("/feedback", {
        method: "POST",
        body: JSON.stringify({
          nurse_id:         nurseId,
          patient_id:       patientId ? Number(patientId) : null,
          context:          lastPrompt,
          response:         lastAcceptedDelta,
          desired_response: desiredResponse,
          liked
        })
      });
      const btn = liked ? likeBtn : dislikeBtn;
      btn.style.opacity = "0.4";
      setTimeout(() => { btn.style.opacity = ""; }, 800);
    } catch (err) {
      console.error("Feedback error:", err);
    }
  }

  // ── Overlay renderer ──────────────────────────────────────────────────────
  function renderOverlay(prefix, suggestion) {
    if (aiRef.isCalling) {
      overlay.innerHTML = `
        <span style="color: transparent;">${prefix}</span>
        <span style="color: #999; font-style: italic;">正在 AI 補全...</span>`;
      return;
    }
    if (!suggestion) { overlay.innerHTML = ""; return; }
    let displaySuggestion = suggestion;
    if (aiRef.type !== "multi-step-options" && suggestion.startsWith(prefix)) {
      displaySuggestion = suggestion.slice(prefix.length);
    }
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${displaySuggestion}</span>`;
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
      aiRef.options       = remainingSteps.map(s => s.label);
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
            if (bmiData < 18.5)                         index = 0;
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

      // Score display
      const score = res.score ?? res.completions[0]?.score ?? null;
      setScore(score);

      // Track prompt for feedback
      lastPrompt = prompt;

      const skill    = res.completions[0];
      aiRef.type     = skill.type;

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

    if (lastChar === "\n") { resetAI(); return; }
    if (aiRef.type === "multi-step-options") { renderOverlay(text, aiRef.full); return; }
    if (!text.trim()) { resetAI(); return; }

    justAccepted = false; // manual typing resets accept state

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

    // Ctrl+Z / Cmd+Z — Undo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
      e.preventDefault();
      if (undoStack.length > 0) {
        redoStack.push(textarea.value);
        textarea.value = undoStack.pop();
        resetAI();
        justAccepted = false;
      }
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z — Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      if (redoStack.length > 0) {
        undoStack.push(textarea.value);
        textarea.value = redoStack.pop();
        resetAI();
        justAccepted = false;
      }
      return;
    }

    // Arrow up / down — cycle options
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!aiRef.options?.length) return;
      e.preventDefault();
      const dir         = (e.key === "ArrowDown") ? 1 : -1;
      aiRef.activeIndex = (aiRef.activeIndex + dir + aiRef.options.length) % aiRef.options.length;
      aiRef.full        = aiRef.options[aiRef.activeIndex];
      renderOverlay(textarea.value, aiRef.full);
      return;
    }

    // Tab
    if (e.key === "Tab") {
      e.preventDefault();

      // Second Tab after acceptance → trigger next AI call
      if (justAccepted && !aiRef.options?.length) {
        justAccepted = false;
        callAI(textarea.value);
        return;
      }

      const chosen = aiRef.full;
      if (!chosen) return;

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

        // All multi-step steps done → wait for next Tab before calling AI
        if (aiRef.type === null) {
          justAccepted = true;
        }
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
        justAccepted = true; // next Tab triggers a new AI call
      }

      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") {
      resetAI();
      justAccepted = false;
    }
  });
}
