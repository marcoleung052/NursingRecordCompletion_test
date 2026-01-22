import { apiFetch } from "./api.js";

/* ---------------------------------------------------------
   手動補全資料庫
--------------------------------------------------------- */
const manualData = {

  // 1. 生命徵象（連續彈出）
  vitalSignsSequence: [
    { key: "BT:", template: "BT: " },
    { key: "PULSE:", template: "PULSE: " },
    { key: "RESP:", template: "RESP: " },
    { key: "NBPs:", template: "NBPs: " },
    { key: "BPd:", template: "BPd: " },
    { key: "HR:", template: "HR: " },
    { key: "OXIMETER:", template: "OXIMETER: " },
    { key: "SpO2:", template: "SpO2: " },
    { key: "RR:", template: "RR: " },
    { key: "ABPs:", template: "ABPs: " },
    { key: "ABPd:", template: "ABPd: " }
  ],

  // 2. 單句補全（含多段）
  singleCompletions: {
    "Admitted": [
      "Admitted at xx:xx，入院護理已完成。簡訊通知  醫師，新病人已入院。",
      "/；由轉送人員協助轉送病人返室"
    ]
  },

  // 3. 群組補全（逐項 + 選項）
  groupedCompletions: {
    "張眼": {
      template: "張眼：x 分 ({選項}) / 眼睛緊閉",
      options: ["Spontaneous", "none", "to speech", "to pain"]
    },
    "語言": {
      template: "語言：x 分 ({選項}) / 插氣管內管",
      options: ["alert", "confused", "none", "groans", "drowsy"]
    },
    "運動": {
      template: "運動：x 分 ({選項})",
      options: ["obeys", "localized pain", "withdrawl"]
    },
    "活動力": {
      template: "活動力：{選項}",
      options: ["正常", "臥床", "軟弱"]
    },
    "呼吸速率": {
      template: "呼吸速率：{選項}",
      options: ["正常", "快"]
    },
    "大便型態": {
      template: "大便型態：{選項}",
      options: ["正常", "其他 -- 術後尚未解便"]
    },
    "皮膚完整性": {
      template: "皮膚完整性：{選項}",
      options: ["是", "否"]
    }
  },

  // 4. 體重序列（含 BMI 計算）
  weightSequence: [
    { key: "體重", template: "體重：xx.x KG" },
    { key: "身高", template: "身高： CM" },
    { key: "BMI", template: "BMI 值：{bmi}" },
    { key: "BMI結果", template: "BMI 結果：{bmiResult}" }
  ],

  bmiCalculator(weightKg, heightCm) {
    const h = heightCm / 100;
    const bmi = +(weightKg / (h * h)).toFixed(1);

    let result = "體重適中";
    if (bmi >= 24 && bmi < 27) result = "輕度肥胖";
    else if (bmi >= 27) result = "中度肥胖";

    return { bmi, result };
  },

  // 5. 依醫囑給予（多選）
  doctorOrderOptions: {
    "依醫囑給予": [
      "依醫囑給予 ，告知藥物作用、副作用、教導注意事項，續觀察有無不適反應。",
      "依醫囑給予  止痛藥品，持續追蹤疼痛緩解情形，未緩解則通知醫師。",
      "使用藥物  後，觀察無不良反應。",
      "目前使用自備藥，藥籤或系統標註【跌】字用藥。",
      "（藥）自費使用"
    ]
  }
};

/* ---------------------------------------------------------
   手動補全邏輯
--------------------------------------------------------- */
function getManualCompletion(text) {
  const last = text.split(/[\s\n]/).pop();

  // 1. 生命徵象連續補全
  const seq = manualData.vitalSignsSequence.find(v => last.includes(v.key));
  if (seq) return { type: "sequence", data: seq.template };

  // 2. 單句補全
  if (manualData.singleCompletions[last]) {
    return { type: "multi", data: manualData.singleCompletions[last] };
  }

  // 3. 群組補全
  if (manualData.groupedCompletions[last]) {
    return { type: "options", data: manualData.groupedCompletions[last] };
  }

  // 4. 體重序列
  const w = manualData.weightSequence.find(v => last.includes(v.key));
  if (w) return { type: "sequence", data: w.template };

  // 5. 依醫囑給予
  if (manualData.doctorOrderOptions[last]) {
    return { type: "multi", data: manualData.doctorOrderOptions[last] };
  }

  return null;
}

/* ---------------------------------------------------------
   AI + 手動補全整合
--------------------------------------------------------- */
export function initAISuggestion(textarea, overlay) {
  if (!textarea || !overlay) return;

  let aiSuggestions = [];
  let activeIndex = 0;
  let isLoading = false;
  let typingTimer = null;
  const delay = 800;

  function renderOverlay(prefix, suffix) {
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suffix}</span>
    `;
  }

  /* ---------------- 手動補全優先 ---------------- */
  function tryManualCompletion(text) {
    const result = getManualCompletion(text);
    if (!result) return false;

    if (result.type === "sequence") {
      renderOverlay(text, result.data);
      aiSuggestions = [text + result.data];
      return true;
    }

    if (result.type === "multi") {
      renderOverlay(text, result.data.join("\n"));
      aiSuggestions = result.data;
      return true;
    }

    if (result.type === "options") {
      const opts = result.data.options.join(" / ");
      const filled = result.data.template.replace("{選項}", opts);
      renderOverlay(text, filled);
      aiSuggestions = [filled];
      return true;
    }

    return false;
  }

  /* ---------------- AI 補全 ---------------- */
  async function callAI(prompt) {
    isLoading = true;
    renderOverlay(prompt, "(正在補全…)");

    try {
      const res = await apiFetch("/api/predict", {
        method: "POST",
        body: JSON.stringify({ prompt })
      });

      aiSuggestions = res.completions;
      activeIndex = 0;

      const full = aiSuggestions[0] || prompt;
      const suffix = full.slice(prompt.length);

      renderOverlay(prompt, suffix);
    } catch {
      renderOverlay(prompt, "");
    }

    isLoading = false;
  }

  /* ---------------- 事件：輸入 ---------------- */
  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      return;
    }

    // 手動補全優先
    if (tryManualCompletion(text)) return;

    // fallback → AI 補全
    typingTimer = setTimeout(() => callAI(text), delay);
  });

  /* ---------------- 事件：鍵盤 ---------------- */
  textarea.addEventListener("keydown", (e) => {
    if (aiSuggestions.length === 0 || isLoading) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const full = aiSuggestions[activeIndex];
      textarea.value = full;
      renderOverlay(full, "");
    }
  });
}
