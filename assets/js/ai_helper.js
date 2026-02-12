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
      autoFillDateTime(aiRef.full);
      return;
    }

    // ---------------------------
    // fixed-sequence
    // ---------------------------
    if (skill.type === "fixed-sequence") {
      aiRef.full = skill.text;
      renderOverlay(prompt, aiRef.full);
      autoFillDateTime(aiRef.full);
      return;
    }

    // ---------------------------
    // trigger-multi-prefix（多選補全）
    // ---------------------------
    if (skill.type === "trigger-multi-prefix") {
      aiRef.options = skill.candidates;
      aiRef.activeIndex = 0;
      aiRef.full = aiRef.options[0];
    
      // 顯示第一個候選
      renderOverlay(prompt, aiRef.full);
      autoFillDateTime(aiRef.full);
      return;
    }

    // ---------------------------
    // multi-options
    // ---------------------------
    if (skill.type === "multi-options") {
      aiRef.options = skill.options;
      aiRef.full = aiRef.options[0];
      renderOverlay(prompt, aiRef.full);
      autoFillDateTime(aiRef.full);
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
      aiRef.results = [];   // ⭐ reset results
      const prefix = ""; 
      renderOverlay(prefix, prefix + aiRef.full);
      autoFillDateTime(aiRef.full);
      return;
    }

    // ---------------------------
    // ai-multi-options
    // ---------------------------
    if (skill.type === "ai-multi-options") {
      aiRef.options = skill.options;
      aiRef.full = aiRef.options[0];
      renderOverlay(prompt, aiRef.full);
      autoFillDateTime(aiRef.full);
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
          aiRef.full = aiRef.options[0];
      
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
  function autoFillDateTime(text) {
  const input = document.getElementById("datetime");
  if (!input) return;

  // 支援三種格式：
  // 1) HH:MM
  // 2) YYYY/MM/DD HH:MM
  // 3) YYYY/MM/DD HH:MM:SS
  const patterns = [
    /\b(\d{2}):(\d{2})\b/,                                   // HH:MM
    /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2}) (\d{2}):(\d{2})\b/, // YYYY/MM/DD HH:MM
    /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2}) (\d{2}):(\d{2}):(\d{2})\b/ // YYYY/MM/DD HH:MM:SS
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      let dt;

      // HH:MM → 用今天日期
      if (match.length === 3) {
        const now = new Date();
        now.setHours(match[1], match[2], 0);
        dt = now;
      }

      // YYYY/MM/DD HH:MM
      else if (match.length === 6) {
        dt = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`);
      }

      // YYYY/MM/DD HH:MM:SS
      else if (match.length === 7) {
        dt = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
      }

      if (dt instanceof Date && !isNaN(dt)) {
        // 修正時區
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        input.value = dt.toISOString().slice(0, 16);
      }

      return; // 找到一個就結束
    }
  }
}
}
