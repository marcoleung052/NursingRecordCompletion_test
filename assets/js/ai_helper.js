import { apiFetch } from "./api.js";

export function initAISuggestion(textarea, overlay) {
  const aiRef = {
    type: null,
    full: null,
    steps: null,
    phase: 0, // 0: 第一步(固定), 1: 選擇 label, 2: 選擇該 label 的內容
    options: [],
    activeIndex: 0,
    results: []
  };

  let typingTimer = null;
  const FRONTEND_DELAY = 100;

  function renderOverlay(prefix, full) {
    if (!full) {
      overlay.innerHTML = "";
      return;
    }
    // 如果 full 已經包含 prefix，就切掉 prefix 顯示灰色後綴
    // 如果不包含（例如多步驟切換中），則在 prefix 後面直接顯示灰色文字
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

    // 如果正在進行多步驟補全，不 call AI，僅更新 overlay
    if (aiRef.type === "multi-step-options") {
      renderOverlay(text, text + (aiRef.full || ""));
      return;
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
    renderOverlay(prompt, " (正在補全…)");
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("id");

    try {
      const res = await apiFetch("/api/predict", {
        method: "POST",
        body: JSON.stringify({ prompt, patient_id: patientId })
      });

      if (!res.completions || res.completions.length === 0) return;
      const skill = res.completions[0];
      aiRef.type = skill.type;

      if (skill.type === "multi-step-options") {
        aiRef.steps = skill.steps;
        aiRef.phase = 0; 
        aiRef.results = [];
        // 第一步的選項
        aiRef.options = skill.steps[0].options.map(opt => replaceTimeWithInput(opt));
        aiRef.activeIndex = 0;
        aiRef.full = aiRef.options[0];
        renderOverlay(prompt, prompt + aiRef.full);
        return;
      }

      // 其他單步模式處理
      if (skill.type === "trigger-prefix") {
        aiRef.full = replaceTimeWithInput(skill.full);
        aiRef.options = [aiRef.full];
      } else if (skill.type === "fixed-sequence") {
        aiRef.full = replaceTimeWithInput(skill.text);
        aiRef.options = [aiRef.full];
      } else if (skill.type === "trigger-multi-prefix") {
        aiRef.options = skill.candidates.map(c => replaceTimeWithInput(c));
        aiRef.full = aiRef.options[0];
      } else if (skill.type === "multi-options" || skill.type === "ai-multi-options") {
        aiRef.options = skill.options.map(o => replaceTimeWithInput(o));
        aiRef.full = aiRef.options[0];
      }
      
      aiRef.activeIndex = 0;
      renderOverlay(prompt, aiRef.full);

    } catch (err) {
      console.error("AI Fetch Error:", err);
      overlay.innerHTML = "";
    }
  }

  // ---------------------------
  // keydown handler
  // ---------------------------
  textarea.addEventListener("keydown", (e) => {
    if (!aiRef.options || aiRef.options.length === 0) return;

    // 上下選擇
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = (e.key === "ArrowDown") ? 1 : -1;
      aiRef.activeIndex = (aiRef.activeIndex + step + aiRef.options.length) % aiRef.options.length;
      aiRef.full = aiRef.options[aiRef.activeIndex];
      
      if (aiRef.type === "multi-step-options") {
        renderOverlay(textarea.value, textarea.value + aiRef.full);
      } else {
        renderOverlay(textarea.value, aiRef.full);
      }
    }

    // 確認補全 (Tab)
    if (e.key === "Tab") {
      e.preventDefault();
      const chosen = aiRef.options[aiRef.activeIndex];
      const text = textarea.value;

      if (aiRef.type === "multi-step-options") {
        // 執行插入
        textarea.value += chosen;
        
        if (aiRef.phase === 0) {
          // 第一步完成 -> 進入 Phase 1 (顯示剩餘的 Labels)
          aiRef.phase = 1;
          aiRef.options = aiRef.steps.slice(1).map(s => s.label);
          aiRef.activeIndex = 0;
          aiRef.full = aiRef.options[0];
          renderOverlay(textarea.value, textarea.value + aiRef.full);
        } 
        else if (aiRef.phase === 1) {
          // 選中了 Label -> 進入 Phase 2 (顯示該 Label 的 Options)
          const stepObj = aiRef.steps.find(s => s.label === chosen);
          aiRef.phase = 2;
          aiRef.options = stepObj.options.map(opt => replaceTimeWithInput(opt));
          aiRef.activeIndex = 0;
          aiRef.full = aiRef.options[0];
          renderOverlay(textarea.value, textarea.value + aiRef.full);
        } 
        else if (aiRef.phase === 2) {
          // 最後一步完成 -> 重設
          resetAI();
          overlay.innerHTML = "";
        }
      } else {
        // 一般模式：刪除 trigger 並插入 full
        const trigger = text.split(/[\s\n]/).pop();
        const triggerIndex = text.lastIndexOf(trigger);
        if (triggerIndex !== -1) {
          textarea.value = text.slice(0, triggerIndex);
        }

        let segment = chosen;
        const lastChar = textarea.value.slice(-1);
        const punctuation = ".,;!?，。；！？、";
        if (lastChar && !punctuation.includes(lastChar) && !segment.startsWith(" ")) {
            segment = " " + segment;
        }

        textarea.value += segment;
        resetAI();
        overlay.innerHTML = "";
      }
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }

    // 取消
    if (e.key === "Escape") {
      resetAI();
      overlay.innerHTML = "";
    }
  });

  function resetAI() {
    aiRef.type = null;
    aiRef.full = null;
    aiRef.steps = null;
    aiRef.phase = 0;
    aiRef.options = [];
    aiRef.activeIndex = 0;
    aiRef.results = [];
  }

  function replaceTimeWithInput(text) {
    const input = document.getElementById("datetime");
    // 如果沒找到 input，改用當前時間作為 fallback
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

    const dateTimeHHMM = `${dateSlash} ${timeHHMM}`;
    const dateTimeHHMMSS = `${dateSlash} ${timeHHMM}:00`;

    return text
      .replace(/\bxxxx\/xx\/xx xx:xx:xx\b/gi, dateTimeHHMMSS)
      .replace(/\bxxxx\/xx\/xx xx:xx\b/gi, dateTimeHHMM)
      .replace(/\bxx:xx\b/gi, timeHHMM);
  }
}
