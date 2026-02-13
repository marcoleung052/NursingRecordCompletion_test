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
  
    // ⭐ trigger-prefix → 本地補全（一定要放最前面）
    if (aiRef.type === "trigger-prefix") {
      const lastToken = text.split(/\s+/).pop();
    
      if (aiRef.full && aiRef.full.startsWith(lastToken)) {
    
        // ⭐ 直接寫進 textarea（不要等 lastToken === full）
        textarea.value = aiRef.full;
    
        // ⭐ 清掉 overlay
        overlay.innerHTML = "";
    
        // ⭐ 清掉 trigger-prefix 狀態
        resetAI();
    
        // ⭐ 觸發 input → callAI("Admitted")
        textarea.dispatchEvent(new Event("input"));
        return;
      }
    
      overlay.innerHTML = "";
      return;
    }
  
    // ⭐ multi-step-options → 本地補全
    if (aiRef.type === "multi-step-options") {
      const lastToken = text.split(/\s+/).pop();
      if (aiRef.full.startsWith(lastToken)) {
        renderOverlay(text, aiRef.full);
      }
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
      aiRef.full = replaceTimeWithInput(skill.full);
      aiRef.options = [aiRef.full];
      aiRef.activeIndex = 0;
      renderOverlay(prompt, aiRef.full);
      return;
    }

    // ---------------------------
    // fixed-sequence
    // ---------------------------
    if (skill.type === "fixed-sequence") {
      aiRef.full = replaceTimeWithInput(skill.text);
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
      // ⭐ 第一個 STEP：直接進入 option，不插入 label
      aiRef.stepIndex = 0;
      aiRef.options = aiRef.steps[0].options;   // 只顯示 option
      aiRef.activeIndex = 0;
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

      // 取使用者輸入的最後一段（不會要求你手動加空白）
      const trigger = text.trim().split(/\s+/).pop();

      // ⭐ 不會重複宣告 toInsert
      let toInsert = full.startsWith(trigger)
        ? full.slice(trigger.length)
        : full;

      // ⭐ 正確宣告 segment
      let segment = toInsert;

      // ⭐ 智慧空白：只有前後都沒有標點符號才加空白
      if (aiRef.type !== "trigger-prefix" && aiRef.type !== "trigger-multi-prefix") {

        const lastChar = textarea.value.slice(-1);
        const firstChar = segment[0];
        const punctuation = ".,;!?，。；！？、";

        const needSpaceBefore = !punctuation.includes(lastChar);
        const needSpaceAfter = !punctuation.includes(firstChar);

        if (needSpaceBefore && needSpaceAfter) {
          segment = " " + segment;
        }
      }

      appendSegment(textarea, segment, aiRef.type);
      overlay.innerHTML = "";
      textarea.dispatchEvent(new Event("input"));

      // ⭐ multi-step-options：STEP → option → STEP → option
      if (aiRef.type === "multi-step-options") {
      
        // 如果正在選 STEP label
        if (aiRef.waitingForStepLabel) {
          const chosenLabel = aiRef.full; // 使用者選的 STEP label
      
          // 插入 label（前面加空白）
          appendSegment(textarea, " " + chosenLabel, aiRef.type);
      
          // 找到該 STEP
          const step = aiRef.steps[aiRef.stepIndex];
      
          // 顯示該 STEP 的 options
          aiRef.options = step.options;
          aiRef.activeIndex = 0;
          aiRef.full = replaceTimeWithInput(aiRef.options[0]);
      
          renderOverlay(textarea.value, textarea.value + " " + aiRef.full);
      
          aiRef.waitingForStepLabel = false;
          return;
        }
      
        // ⭐ 插入 option
        aiRef.results.push(segment);
      
        // ⭐ 下一個 STEP
        aiRef.stepIndex++;
      
        if (aiRef.stepIndex < aiRef.steps.length) {
      
          // ⭐ 顯示下一個 STEP label（讓使用者選）
          const nextStep = aiRef.steps[aiRef.stepIndex];
      
          aiRef.options = [nextStep.label];
          aiRef.activeIndex = 0;
          aiRef.full = nextStep.label;
      
          renderOverlay(textarea.value, textarea.value + " " + aiRef.full);
      
          aiRef.waitingForStepLabel = true;
          return;
        }
      
        resetAI();
        return;
      }

      resetAI();
    }
  });

    function appendSegment(textarea, text, type) {
      if (type === "trigger-prefix" || type === "trigger-multi-prefix") {
        textarea.value += text;
      } else {
        textarea.value += text;   // 已經在外面加空白了
      }
    
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
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
    
      // datetime-local → 拆成日期與時間
      const [datePart, timePart] = input.value.split("T");
      const [hh, mm] = timePart.split(":");
    
      // 產生三種格式
      const timeHHMM = `${hh}:${mm}`;
      const dateSlash = datePart.replace(/-/g, "/");
      const dateTimeHHMM = `${dateSlash} ${hh}:${mm}`;
      const dateTimeHHMMSS = `${dateSlash} ${hh}:${mm}:00`;
    
      // 依照 AI 補全的格式替換
      return text
        // 1) xxxx/xx/xx xx:xx:xx → 用 HH:MM:SS
        .replace(/\bxxxx\/xx\/xx xx:xx:xx\b/gi, dateTimeHHMMSS)
        // 2) xxxx/xx/xx xx:xx → 用 HH:MM
        .replace(/\bxxxx\/xx\/xx xx:xx\b/gi, dateTimeHHMM)
        // 3) xx:xx → 用 HH:MM
        .replace(/\bxx:xx\b/gi, timeHHMM);
    }
}
