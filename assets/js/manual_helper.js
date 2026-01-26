// ===============================
// manual_helper.js
// ===============================

// 插入文字到游標位置
export function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  textarea.value = before + text + after;
  const newPos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;
}

// -------------------------------
// 手動補全資料庫
// -------------------------------
const manualData = {
  // 1. 生命徵象（固定順序）
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

  // 2. Admitted 多階段
  admittedSteps: [
    "Admitted at xx:xx，入院護理已完成。",
    "簡訊通知 醫師，新病人已入院。",
    "/；由轉送人員協助轉送病人返室"
  ],

  // 3. 群組補全（GCS / 一般評估）
  groupedCompletions: {
    張眼: {
      type: "multi",
      templates: [
        {
          template: "張眼：x 分 ({選項})",
          options: ["Spontaneous", "none", "to speech", "to pain"]
        },
        { template: "張眼：眼睛緊閉" }
      ]
    },
    語言: {
      type: "multi",
      templates: [
        {
          template: "語言：x 分 ({選項})",
          options: ["alert", "confused", "none", "groans", "drowsy"]
        },
        { template: "語言：插氣管內管" }
      ]
    },
    運動: {
      template: "運動：x 分 ({選項})",
      options: ["obeys", "localized pain", "withdrawl"]
    },
    活動力: {
      template: "活動力：{選項}",
      options: ["正常", "臥床", "軟弱"]
    },
    呼吸速率: {
      template: "呼吸速率：{選項}",
      options: ["正常", "快"]
    },
    大便型態: {
      template: "大便型態：{選項}",
      options: ["正常", "其他 -- 術後尚未解便"]
    },
    皮膚完整性: {
      template: "皮膚完整性：{選項}",
      options: ["是", "否"]
    }
  },

  // 群組順序（插入後自動跳下一個）
  groupedOrder: [
    "張眼",
    "語言",
    "運動",
    "活動力",
    "呼吸速率",
    "大便型態",
    "皮膚完整性"
  ],

  // 4. 體重 / BMI 序列
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

  // 5. 醫囑句型（兩段式）
  doctorOrderPairs: [
    {
      trigger: "依醫囑給予",
      first: "依醫囑給予 xxx，",
      seconds: [
        "告知藥物作用、副作用、教導注意事項，續觀察有無不適反應。",
        "止痛藥品，持續追蹤疼痛緩解情形，未緩解則通知醫師。"
      ]
    },
    {
      trigger: "使用藥物",
      first: "使用藥物 xxx",
      seconds: [" 後，觀察無不良反應。"]
    },
    {
      trigger: "目前使用自備藥",
      first: "目前使用自備藥",
      seconds: ["，藥籤或系統標註【跌】字用藥。"]
    },
    {
      trigger: "（藥）",
      first: "（藥）",
      seconds: ["自費使用"]
    }
  ]
};

// -------------------------------
// 取得手動補全結果
// -------------------------------
function getManualCompletion(text) {
  const last = getLastToken(text);

  // 1. 生命徵象：輸入 key 時給 template
  const vital = manualData.vitalSignsSequence.find(v => last === v.key);
  if (vital) {
    return { kind: "vital", type: "sequence", data: vital.template };
  }

  // 2. Admitted：輸入 "Admitted" 時給第一段
  if (last === "Admitted") {
    return { kind: "admitted", type: "step", index: 0, data: manualData.admittedSteps[0] };
  }

  // 3. 群組補全：輸入 key 時給對應模板
  if (manualData.groupedCompletions[last]) {
    const g = manualData.groupedCompletions[last];

    if (g.type === "multi") {
      return { kind: "grouped", type: "multiTemplates", key: last, data: g.templates };
    }

    return { kind: "grouped", type: "options", key: last, data: g };
  }

  // 4. 體重 / 身高 / BMI
  const w = manualData.weightSequence.find(v => last === v.key);
  if (w) {
    return { kind: "weight", type: "sequence", key: w.key, data: w.template };
  }

  // 5. 醫囑句型：輸入 trigger 時給第一段
  const doctor = manualData.doctorOrderPairs.find(p => last === p.trigger);
  if (doctor) {
    return { kind: "doctor", type: "doctorFirst", data: doctor.first, trigger: doctor.trigger };
  }

  return null;
}

// -------------------------------
// 渲染手動補全 overlay
// -------------------------------
function renderManualCompletion(text, overlay, aiRef, result) {
  // 1. 生命徵象 / 體重序列：單一 template
  if (result.type === "sequence") {
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${result.data}</span>
    `;
    aiRef.value = [result.data];
    aiRef.meta = { kind: result.kind, key: result.key || null };
    return true;
  }

  // 2. Admitted 第一步
  if (result.kind === "admitted" && result.type === "step") {
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${result.data}</span>
    `;
    aiRef.value = [result.data];
    aiRef.meta = { kind: "admitted", step: 0 };
    return true;
  }

  // 3. 群組：多模板（張眼 / 語言）
  if (result.kind === "grouped" && result.type === "multiTemplates") {
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

    aiRef.meta = { kind: "grouped", key: result.key };
    return true;
  }

  // 4. 群組：單模板 + 選項
  if (result.kind === "grouped" && result.type === "options") {
    const preview = result.data.template.replace("{選項}", result.data.options.join(" / "));
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${preview}</span>
    `;
    aiRef.value = [preview];
    aiRef.meta = { kind: "grouped", key: result.key };
    return true;
  }

  // 5. 醫囑第一段
  if (result.kind === "doctor" && result.type === "doctorFirst") {
    overlay.innerHTML = `
      <span style="color: transparent;">${text}</span>
      <span style="color: #ccc;">${result.data}</span>
    `;
    aiRef.value = [result.data];
    aiRef.meta = { kind: "doctor", trigger: result.trigger, stage: "first" };
    return true;
  }

  return false;
}

// -------------------------------
// Tab 接受後 → 自動跳下一個
// -------------------------------
function handleAfterManualAccept(textarea, overlay, aiRef) {
  const full = aiRef.value[aiRef.activeIndex] || "";
  const meta = aiRef.meta || {};

  // 1. 生命徵象：找出目前 template 在 sequence 中的位置 → 下一個 key
  if (meta.kind === "vital") {
    const idx = manualData.vitalSignsSequence.findIndex(v => v.template === full);
    if (idx >= 0 && idx < manualData.vitalSignsSequence.length - 1) {
      const nextKey = manualData.vitalSignsSequence[idx + 1].key;
      textarea.value = textarea.value + nextKey;
      const text = textarea.value;
      const result = getManualCompletion(text);
      if (result) renderManualCompletion(text, overlay, aiRef, result);
      return;
    }
  }

  // 2. 群組：依 groupedOrder 跳下一個 key
  if (meta.kind === "grouped") {
    const currentKey = manualData.groupedOrder.find(k => full.startsWith(k));
    if (currentKey) {
      const idx = manualData.groupedOrder.indexOf(currentKey);
      if (idx >= 0 && idx < manualData.groupedOrder.length - 1) {
        const nextKey = manualData.groupedOrder[idx + 1];
        textarea.value = textarea.value + "\n" + nextKey;
        const text = textarea.value;
        const result = getManualCompletion(text);
        if (result) renderManualCompletion(text, overlay, aiRef, result);
        return;
      }
    }
  }

  // 3. 體重 / BMI 序列
  if (meta.kind === "weight") {
    if (full.startsWith("體重：")) {
      textarea.value = textarea.value + "\n身高： ";
      const text = textarea.value;
      const result = getManualCompletion(text);
      if (result) renderManualCompletion(text, overlay, aiRef, result);
      return;
    }

    if (full.startsWith("身高：")) {
      const bmiInfo = computeBMIFromText(textarea.value);
      if (!bmiInfo) return;

      const bmiLine = `BMI 值：${bmiInfo.bmi}`;
      const resultLine = `BMI 結果：${bmiInfo.result}`;

      // 先只建議 BMI 值，接受後再建議 BMI 結果
      overlay.innerHTML = `
        <span style="color: transparent;">${textarea.value}</span>
        <span style="color: #ccc;">${bmiLine}</span>
      `;
      aiRef.value = [bmiLine, resultLine];
      aiRef.activeIndex = 0;
      aiRef.meta = { kind: "weightBMI" };
      return;
    }
  }

  // 3-2. BMI 值 → BMI 結果
  if (aiRef.meta && aiRef.meta.kind === "weightBMI") {
    if (full.startsWith("BMI 值：")) {
      textarea.value = textarea.value + "\n" + full;
      const resultLine = aiRef.value[1];
      overlay.innerHTML = `
        <span style="color: transparent;">${textarea.value}</span>
        <span style="color: #ccc;">${resultLine}</span>
      `;
      aiRef.value = [resultLine];
      aiRef.activeIndex = 0;
      aiRef.meta = { kind: "weightBMIResult" };
      return;
    }
  }

  // 4. Admitted 多階段
  if (meta.kind === "admitted") {
    const step = meta.step ?? 0;

    // 第 0 步剛插入 → 提供第二、第三句選擇
    if (step === 0 && full.startsWith("Admitted at")) {
      const second = manualData.admittedSteps[1];
      const third = manualData.admittedSteps[2];

      overlay.innerHTML = `
        <span style="color: transparent;">${textarea.value}</span>
        <span style="color: #ccc;">${second}</span>
      `;
      aiRef.value = [second, third];
      aiRef.activeIndex = 0;
      aiRef.meta = { kind: "admitted", step: 1 };
      return;
    }

    // 第 1 步：如果選的是第二句 → 再自動跳第三句
    if (step === 1 && full.startsWith("簡訊通知")) {
      const third = manualData.admittedSteps[2];
      overlay.innerHTML = `
        <span style="color: transparent;">${textarea.value}</span>
        <span style="color: #ccc;">${third}</span>
      `;
      aiRef.value = [third];
      aiRef.activeIndex = 0;
      aiRef.meta = { kind: "admitted", step: 2 };
      return;
    }
  }

  // 5. 醫囑句型：第一段 → 第二段
  if (meta.kind === "doctor" && meta.stage === "first") {
    const pair = manualData.doctorOrderPairs.find(p => p.first === full);
    if (pair) {
      const seconds = pair.seconds;
      overlay.innerHTML = `
        <span style="color: transparent;">${textarea.value}</span>
        <span style="color: #ccc;">${seconds[0]}</span>
      `;
      aiRef.value = seconds;
      aiRef.activeIndex = 0;
      aiRef.meta = { kind: "doctor", stage: "second", trigger: pair.trigger };
      return;
    }
  }
}
