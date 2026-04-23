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
    full: null,
    currentMapping: []
  };

  let typingTimerFast = null;
  let typingTimerSlow = null;
  let currentController = null;

  function renderOverlay(prefix, suggestion) {
    if (!suggestion) {
      overlay.innerHTML = "";
      return;
    }
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
    aiRef.steps = [];
    aiRef.completedIndices.clear();
    aiRef.currentStepIndex = null;
    aiRef.phase = "label";
    aiRef.options = [];
    aiRef.activeIndex = 0;
    aiRef.full = null;
    overlay.innerHTML = "";
  }

  function isChinese(char) {
    return /[一-龥]/.test(char);
  }

  function getSmartSpace(prevText, nextText, forceSpace = false) {
    if (!prevText || !nextText) return "";
    const lastChar = prevText.slice(-1);
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
      .replace(/\bxxxx\/xx\/xx xx:xx\b/gi, `${dateSlash} ${timeHHMM}`)
      .replace(/\bxx:xx\b/gi, timeHHMM);
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
      aiRef.options = remainingSteps.map(s => s.label);
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
            if (bmiData < 18.5) index = 0;
            else if (bmiData >= 24 && bmiData < 27) index = 1;
            else if (bmiData >= 27 && bmiData < 30) index = 2;
            else if (bmiData >= 30) index = 3;
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
    const text = textarea.value;
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
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("pid") || params.get("id");
    if (!patientId) { resetAI(); return; }

    if (currentController) currentController.abort();
    currentController = new AbortController();

    try {
      const res = await apiFetch("/predict", {
        method: "POST",
        body: JSON.stringify({ prompt, patient_id: patientId }),
        signal: currentController.signal
      });
      currentController = null;

      if (!res.completions?.length) { resetAI(); return; }
      const skill = res.completions[0];
      aiRef.type = skill.type;

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.completedIndices.clear();
        const trimmedPrompt = prompt.trim();
        const firstLabel = skill.steps[0].label;
        if (trimmedPrompt === firstLabel || trimmedPrompt.endsWith(firstLabel)) {
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
      if (err.name === "AbortError") return;
      console.error("AI Error:", err);
      resetAI();
    }
  }

  textarea.addEventListener("input", () => {
    clearTimeout(typingTimerFast);
    clearTimeout(typingTimerSlow);

    const text = textarea.value;
    const lastChar = text.slice(-1);

    if (lastChar === "\n") { resetAI(); return; }
    if (aiRef.type === "multi-step-options") { renderOverlay(text, aiRef.full); return; }
    if (!text.trim()) { resetAI(); return; }

    // 300ms：固定觸發（後端幾乎即時回）
    typingTimerFast = setTimeout(() => {
      clearTimeout(typingTimerSlow);
      callAI(text);
    }, 300);

    // 800ms：AI fallback（停止打字後才真正跑推論）
    typingTimerSlow = setTimeout(() => {
      clearTimeout(typingTimerFast);
      callAI(text);
    }, 800);
  });

  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options || aiRef.options.length === 0) return;

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
      if (!chosen) return;

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
        updateStepState();
      } else {
        const text = textarea.value;
        const trigger = text.split(/[\s\n]/).pop();

        const needsReplace = ["trigger-prefix", "trigger-multi-prefix"].includes(aiRef.type);
        if (needsReplace) {
          const triggerIndex = text.lastIndexOf(trigger);
          if (triggerIndex !== -1) textarea.value = text.slice(0, triggerIndex);
        }

        const space = getSmartSpace(textarea.value, chosen, false);
        textarea.value += space + chosen;

        const currentContent = textarea.value;
        resetAI();
        callAI(currentContent);
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    if (e.key === "Escape") resetAI();
  });
}
