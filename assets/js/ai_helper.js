import { apiFetch } from "./api.js";

/* ---------------------------------------------------------
   手動補全資料庫
--------------------------------------------------------- */
const manualData = {
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

  singleCompletions: {
    "Admitted": [
      "Admitted at xx:xx，入院護理已完成。簡訊通知 醫師，新病人已入院。",
      "/；由轉送人員協助轉送病人返室"
    ]
  },

  groupedCompletions: {
    "張眼": {
      type: "multi",
      templates: [
        {
          template: "張眼：x 分 ({選項})",
          options: ["Spontaneous", "none", "to speech", "to pain"]
        },
        { template: "張眼：眼睛緊閉" }
      ]
    },

    "語言": {
      type: "multi",
      templates: [
        {
          template: "語言：x 分 ({選項})",
          options: ["alert", "confused", "none", "groans", "drowsy"]
        },
        { template: "語言：插氣管內管" }
      ]
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
   getManualCompletion
--------------------------------------------------------- */
function getManualCompletion(text) {
  const last = text.split(/[\s\n]/).pop();

  const seq = manualData.vitalSignsSequence.find(v => last.includes(v.key));
  if (seq) return { type: "sequence", data: seq.template };

  if (manualData.singleCompletions[last]) {
    return { type: "multi", data: manualData.singleCompletions[last] };
  }

  if (manualData.groupedCompletions[last]) {
    const g = manualData.groupedCompletions[last];
    if (g.type === "multi") return { type: "multiTemplates", data: g.templates };
    return { type: "options", data: g };
  }

  const w = manualData.weightSequence.find(v => last.includes(v.key));
  if (w) return { type: "sequence", data: w.template };

  if (manualData.doctorOrderOptions[last]) {
    return { type: "multi", data: manualData.doctorOrderOptions[last] };
  }

  return null;
}

/* ---------------------------------------------------------
   手動補全渲染
--------------------------------------------------------- */
function tryManualCompletion(text, overlay, aiRef) {
  const result = getManualCompletion(text);
  if (!result) return false;

  if (result.type === "sequence") {
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${result.data}</span>
    `;
    aiRef.value = [result.data];
    return true;
  }

  if (result.type === "multi") {
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${result.data[0]}</span>
    `;
    aiRef.value = result.data;
    return true;
  }

  if (result.type === "multiTemplates") {
    const first = result.data[0];
    let preview = first.template;

    if (first.options) {
      preview = preview.replace("{選項}", first.options.join(" / "));
    }

    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${preview}</span>
    `;

    aiRef.value = result.data.map(t => {
      if (t.options) {
        return t.template.replace("{選項}", t.options.join(" / "));
      }
      return t.template;
    });

    return true;
  }

  if (result.type === "options") {
    const preview = result.data.template.replace("{選項}", result.data.options.join(" / "));
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${preview}</span>
    `;
    aiRef.value = [preview];
    return true;
  }

  return false;
}

/* ---------------------------------------------------------
   AI + 手動補全整合
--------------------------------------------------------- */
export function initAISuggestion(textarea, overlay) {
  if (!textarea || !overlay) return;

  const aiRef = { value: [] };
  let activeIndex = 0;
  let typingTimer = null;
  const delay = 800;

  function renderOverlay(prefix, suffix) {
    overlay.innerHTML = `
      <span style="color: transparent;">${prefix}</span>
      <span style="color: #ccc;">${suffix}</span>
    `;
  }

  textarea.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = textarea.value;
    if (!text.trim()) {
      overlay.innerHTML = "";
      return;
    }

    if (tryManualCompletion(text, overlay, aiRef)) {
      activeIndex = 0;
      return;
    }

    typingTimer = setTimeout(() => callAI(text), delay);
  });

  async function callAI(prompt) {
    renderOverlay(prompt, "(正在補全…)");

    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });

    aiRef.value = res.completions;
    activeIndex = 0;

    const full = aiRef.value[0] || prompt;
    const suffix = full.slice(prompt.length);

    renderOverlay(prompt, suffix);
  }

  textarea.addEventListener("keydown", (e) => {
    if (aiRef.value.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % aiRef.value.length;
      renderOverlay(textarea.value, aiRef.value[activeIndex]);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + aiRef.value.length) % aiRef.value.length;
      renderOverlay(textarea.value, aiRef.value[activeIndex]);
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const full = aiRef.value[activeIndex];
      textarea.value = full;
      overlay.innerHTML = "";
    }
  });
}
