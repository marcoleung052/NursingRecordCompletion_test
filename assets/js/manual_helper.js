// ===============================
// manual_helper.js（完整版本）
// ===============================

// 取得最後 token
function getLastToken(text) {
  return text.split(/[\s\n]/).pop();
}

// 插入文字到游標位置
export function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  textarea.value = before + text + after;
  const newPos = before.length + text.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;
}

// ===============================
// 生命徵象（格式 B）
// ===============================
export const vitalSignsSequence = [
  "BT:",
  "PULSE:",
  "RESP:",
  "NBPs:",
  "BPd:",
  "HR:",
  "OXIMETER:",
  "SpO2:",
  "RR:",
  "ABPs:",
  "ABPd:"
];

// ===============================
// GCS（多選項 + 連續補全）
// ===============================
export const gcsOptions = {
  "張眼": [
    "張眼：x分(Spontaneous)",
    "張眼：x分(none)",
    "張眼：x分(to speech)",
    "張眼：x分(to pain)",
    "張眼：眼睛緊閉"
  ],
  "語言": [
    "語言：x分(alert)",
    "語言：x分(confused)",
    "語言：x分(none)",
    "語言：x分(groans)",
    "語言：x分(drowsy)",
    "語言：插氣管內管"
  ],
  "運動": [
    "運動：x分(obeys)",
    "運動：x分(localized pain)",
    "運動：x分(withdrawl)"
  ]
};

export const gcsOrder = ["張眼", "語言", "運動"];

// ===============================
// Admitted（多選項 + 分支 + 連續補全）
// ===============================
export const admittedOptions = [
  "簡訊通知醫師，新病人已入院。",
  "/；由轉送人員協助轉送病人返室"
];

export const admittedFollowUp = {
  "簡訊通知醫師，新病人已入院。": "/；由轉送人員協助轉送病人返室"
};

// ===============================
// 其他欄位（自動解析 "/" → 多選項）
// ===============================
export const customFields = {
  "肌肉張力左上肢": "muscle power = x/無法測量",
  "肌肉張力左下肢": "muscle power = x/無法測量",
  "肌肉張力右上肢": "muscle power = x/無法測量",
  "肌肉張力右下肢": "muscle power = x/無法測量",
  "活動力": "正常/臥床/軟弱",
  "脈律": "正常",
  "呼吸道": "通暢",
  "呼吸音": "正常",
  "呼吸速率": "正常/快",
  "呼吸型態": "深",
  "腹部": "軟",
  "腸蠕動音": "正常",
  "體重": "xKG",
  "身高": "xxxCM",
  "大便次數(昨日)": "0",
  "大便型態": "正常/其他--術後尚未解便",
  "大便顏色": "黃色",
  "排尿情況": "正常",
  "皮膚溫度": "溫暖",
  "皮膚顏色": "粉紅",
  "皮膚完整性": "是/否",
  "皮膚病灶": "無",
  "水腫級數": "無",
  "壓瘡": "無",
  "痰量": "無"
};

// ===============================
// 主邏輯：取得手動補全
// ===============================
export function getManualCompletion(text) {
  const last = getLastToken(text);

  // 生命徵象（連續補全）
  const idx = vitalSignsSequence.indexOf(last);
  if (idx !== -1 && idx < vitalSignsSequence.length - 1) {
    return {
      kind: "vitalSeq",
      step: idx + 1,
      options: [vitalSignsSequence[idx + 1]]
    };
  }

  // GCS（多選項 + 連續補全）
  if (gcsOptions[last]) {
    return {
      kind: "gcs",
      step: gcsOrder.indexOf(last),
      options: gcsOptions[last]
    };
  }

  // Admitted（多選項）
  if (last === "Admitted") {
    return {
      kind: "admitted",
      options: admittedOptions
    };
  }

  // 其他欄位（自動解析 "/"）
  if (customFields[last]) {
    const raw = customFields[last];

    if (raw.includes("/")) {
      return {
        kind: "customOptions",
        options: raw.split("/")
      };
    } else {
      return {
        kind: "customInput",
        insert: `${last}：`
      };
    }
  }

  return null;
}

// ===============================
// 顯示補全 overlay
// ===============================
export function renderManualCompletion(text, overlay, aiRef, result) {
  aiRef.value = result.options || [result.insert];
  aiRef.meta = result;
  aiRef.activeIndex = 0;

  const suffix = aiRef.value[0];

  overlay.innerHTML = `
    <span style="color: transparent;">${text}</span>
    <span style="color: #ccc;">${suffix}</span>
  `;
}

// ===============================
// Tab 接受後 → 自動跳下一個
// ===============================
export function handleAfterManualAccept(textarea, overlay, aiRef) {
  const meta = aiRef.meta;
  if (!meta) return;

  // 生命徵象連續補全
  if (meta.kind === "vitalSeq") {
    const next = vitalSignsSequence[meta.step + 1];
    if (!next) {
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    aiRef.value = [next];
    aiRef.meta = { kind: "vitalSeq", step: meta.step + 1 };
    overlay.innerHTML = `
      <span style="color: transparent;">${textarea.value}</span>
      <span style="color: #ccc;">${next}</span>
    `;
    return;
  }

  // GCS 連續補全
  if (meta.kind === "gcs") {
    const nextStep = meta.step + 1;
    const nextTrigger = gcsOrder[nextStep];

    if (!nextTrigger) {
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    aiRef.value = gcsOptions[nextTrigger];
    aiRef.meta = { kind: "gcs", step: nextStep };
    overlay.innerHTML = `
      <span style="color: transparent;">${textarea.value}</span>
      <span style="color: #ccc;">${aiRef.value[0]}</span>
    `;
    return;
  }

  // Admitted 分支補全
  if (meta.kind === "admitted") {
    const chosen = aiRef.value[aiRef.activeIndex];
    const follow = admittedFollowUp[chosen];

    if (!follow) {
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    aiRef.value = [follow];
    aiRef.meta = { kind: "admittedDone" };
    overlay.innerHTML = `
      <span style="color: transparent;">${textarea.value}</span>
      <span style="color: #ccc;">${follow}</span>
    `;
    return;
  }

  // 其他欄位 → 結束
  aiRef.value = [];
  aiRef.meta = null;
}
