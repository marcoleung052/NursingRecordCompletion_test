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
export const gcsOrder = ["張眼", "語言", "運動"];

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

export const admittedFirst = "Admitted at xx:xx，入院護理已完成。";

export const admittedOptions = [
  "簡訊通知醫師，新病人已入院。",
  "/；由轉送人員協助轉送病人返室"
];

export const admittedFollowUp = {
  "簡訊通知醫師，新病人已入院。": "/；由轉送人員協助轉送病人返室"
};

export const customFieldOrder = [
  "肌肉張力左上肢",
  "肌肉張力左下肢",
  "肌肉張力右上肢",
  "肌肉張力右下肢",
  "活動力",
  "脈律",
  "呼吸道",
  "呼吸音",
  "呼吸速率",
  "呼吸型態",
  "腹部",
  "腸蠕動音",
  "體重",
  "身高",
  "大便次數(昨日)",
  "大便型態",
  "大便顏色",
  "排尿情況",
  "皮膚溫度",
  "皮膚顏色",
  "皮膚完整性",
  "皮膚病灶",
  "水腫級數",
  "壓瘡",
  "痰量"
];

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

  // Vital Signs
  const vsIndex = vitalSignsSequence.indexOf(last);
  if (vsIndex !== -1 && vsIndex < vitalSignsSequence.length - 1) {
    return {
      kind: "vital",
      step: vsIndex + 1,
      options: [vitalSignsSequence[vsIndex + 1]]
    };
  }

  // GCS
  if (gcsOptions[last]) {
    return {
      kind: "gcs",
      step: gcsOrder.indexOf(last),
      options: gcsOptions[last]
    };
  }

  // Admitted
  if (last === "Admitted") {
    return {
      kind: "admittedFirst",
      options: [admittedFirst]
    };
  }

  if (last === admittedFirst) {
    return {
      kind: "admittedChoice",
      options: admittedOptions
    };
  }

  // customFields
  if (customFields[last] !== undefined) {
    const raw = customFields[last];

    if (raw.includes("/")) {
      return {
        kind: "customOptions",
        step: customFieldOrder.indexOf(last),
        field: last,
        options: raw.split("/")
      };
    } else {
      return {
        kind: "customInput",
        step: customFieldOrder.indexOf(last),
        field: last,
        insert: `${last}：`
      };
    }
  }

  return null;
}

export function renderManualCompletion(text, overlay, aiRef, result) {
  aiRef.value = result.options || [result.insert];
  aiRef.meta = result;
  aiRef.activeIndex = 0;

  overlay.innerHTML = `
    <span style="color: transparent;">${text}</span>
    <span style="color: #ccc;">${aiRef.value[0]}</span>
  `;
}
export function handleAfterManualAccept(textarea, overlay, aiRef) {
  const meta = aiRef.meta;
  if (!meta) return;

  // Vital Signs
  if (meta.kind === "vital") {
    const next = vitalSignsSequence[meta.step + 1];
    if (!next) return clear(aiRef);
    return showNext(textarea, overlay, aiRef, {
      kind: "vital",
      step: meta.step + 1,
      options: [next]
    });
  }

  // GCS
  if (meta.kind === "gcs") {
    const nextTrigger = gcsOrder[meta.step + 1];
    if (!nextTrigger) return clear(aiRef);
    return showNext(textarea, overlay, aiRef, {
      kind: "gcs",
      step: meta.step + 1,
      options: gcsOptions[nextTrigger]
    });
  }

  // Admitted
  if (meta.kind === "admittedFirst") {
    return showNext(textarea, overlay, aiRef, {
      kind: "admittedChoice",
      options: admittedOptions
    });
  }

  if (meta.kind === "admittedChoice") {
    const chosen = aiRef.value[aiRef.activeIndex];
    const follow = admittedFollowUp[chosen];
    if (!follow) return clear(aiRef);
    return showNext(textarea, overlay, aiRef, {
      kind: "admittedDone",
      options: [follow]
    });
  }

  // customFields
  if (meta.kind === "customOptions" || meta.kind === "customInput") {
    const nextField = customFieldOrder[meta.step + 1];
    if (!nextField) return clear(aiRef);

    const raw = customFields[nextField];

    if (raw.includes("/")) {
      return showNext(textarea, overlay, aiRef, {
        kind: "customOptions",
        step: meta.step + 1,
        field: nextField,
        options: raw.split("/").map(opt => `${nextField}：${opt}`)
      });
    } else {
      return showNext(textarea, overlay, aiRef, {
        kind: "customInput",
        step: meta.step + 1,
        field: nextField,
        options: [`${nextField}：`]
      });
    }
  }

  clear(aiRef);
}

function showNext(textarea, overlay, aiRef, meta) {
  aiRef.value = meta.options;
  aiRef.meta = meta;
  aiRef.activeIndex = 0;

  overlay.innerHTML = `
    <span style="color: transparent;">${textarea.value}</span>
    <span style="color: #ccc;">${aiRef.value[0]}</span>
  `;
}

function clear(aiRef) {
  aiRef.value = [];
  aiRef.meta = null;
}
