import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    full: null,
    steps: null,
    stepIndex: 0,
    options: [],
    activeIndex: 0,
    results: []
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
  // input handler
  // ---------------------------
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;

    // ⭐ multi-step-options → 本地補全，不 callAI
    if (aiRef.type === "multi-step-options") {
      if (aiRef.full) renderOverlay(text, aiRef.full);
      return;
    }

    // ⭐ fixed-sequence / multi-options → 本地補全
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
  // call backend
  // ---------------------------
  async function callAI(prompt) {
    renderOverlay(prompt, "(正在補全…)");
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("id");

    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        patient_id: patientId
      })
    });


    const skill = res.completions[0];
    aiRef.type = skill.type;

    // ---------------------------
    // trigger-prefix
    // ---------------------------
    if (skill.type === "trigger-prefix") {
      aiRef.full = skill.full;
      aiRef.options = [skill.full];
      aiRef.activeIndex = 0;
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // fixed-sequence
    // ---------------------------
    if (skill.type === "fixed-sequence") {
      aiRef.full = skill.text;
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // trigger-multi-prefix（多選補全）
    // ---------------------------
    if (skill.type === "trigger-multi-prefix") {
      aiRef.options = skill.candidates;
      aiRef.activeIndex = 0;
      aiRef.full = replaceTimeWithInput(aiRef.options[0]);
    
      // 顯示第一個候選
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // multi-options
    // ---------------------------
    if (skill.type === "multi-options") {
      aiRef.options = skill.options;
      aiRef.full = replaceTimeWithInput(aiRef.options[0]);
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
      aiRef.full = replaceTimeWithInput(aiRef.options[0]);
      aiRef.results = [];   // ⭐ reset results
      const prefix = ""; 
      renderOverlay(prefix, prefix + aiRef.full);
      return;
    }

    // ---------------------------
    // ai-multi-options
    // ---------------------------
    if (skill.type === "ai-multi-options") {
      aiRef.options = skill.options;
      aiRef.full = replaceTimeWithInput(aiRef.options[0]);
      renderOverlay(prompt, aiRef.full);
      return;
    }
  }

  // ---------------------------
  // keydown handler
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

      // ---------------------------
      // multi-step-options → 本地 stepIndex 推進
      // ---------------------------
      if (aiRef.type === "multi-step-options") {
        aiRef.results.push(aiRef.options[aiRef.activeIndex]);
        aiRef.stepIndex++;
      
        if (aiRef.stepIndex < aiRef.steps.length) {
          aiRef.options = aiRef.steps[aiRef.stepIndex].options;
          aiRef.activeIndex = 0;
          aiRef.full = replaceTimeWithInput(aiRef.options[0]);
      
          // 更新 textarea（讓使用者看到累積結果）
          textarea.value = prefix;
          
          // 更新 overlay（顯示下一個候選）
          renderOverlay(prefix, prefix + aiRef.full);

      
          renderOverlay(prefix, prefix + aiRef.full);
        } else {
          const finalText = aiRef.results.join("、");
          textarea.value = finalText;
          resetAI();
        }
        return;
      }


      // ---------------------------
      // trigger-prefix → 插入後 callAI("張眼")
      // ---------------------------
      if (aiRef.type === "trigger-prefix") {
        const newText = textarea.value;
        resetAI();
        callAI(newText);
        return;
      }

      if (aiRef.type === "trigger-multi-prefix") {
        const newText = textarea.value;
        resetAI();
        callAI(newText);
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
      aiRef.results = [];
    }
    function replaceTimeWithInput(text) {
    const input = document.getElementById("datetime");
    if (!input || !input.value) return text;
  
    // datetime-local 格式：YYYY-MM-DDTHH:MM
    const localTime = input.value.replace("T", " ");
  
    // 支援三種格式：
    // 1) HH:MM
    // 2) YYYY/MM/DD HH:MM
    // 3) YYYY/MM/DD HH:MM:SS
    const patterns = [
      /\b\d{2}:\d{2}\b/g,
      /\b\d{4}[\/\-]\d{2}[\/\-]\d{2} \d{2}:\d{2}\b/g,
      /\b\d{4}[\/\-]\d{2}[\/\-]\d{2} \d{2}:\d{2}:\d{2}\b/g
    ];
  
    let result = text;
  
    for (const p of patterns) {
      result = result.replace(p, localTime);
    }
  
    return result;
  }
}
}
