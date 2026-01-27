// ===============================
// manual_helper.js（完整修正版）
// ===============================

// 取得最後 token
function getLastToken(text) {
  return text.split(/[\s\n]/).pop();
}

// 插入文字到游標位置（不刪 trigger）
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
// GCS（連續補全）
// ===============================
export const gcsSequence = [
  "張眼：x 分 (Spontaneous / none / to speech / to pain)",
  "語言：x 分 (alert / confused / none / groans / drowsy)",
  "運動：x 分 (obeys / localized pain / withdrawl)"
];

const gcsTriggerMap = {
  "張眼": 0,
  "語言": 1,
  "運動": 2
};

// ===============================
// Admitted 多步驟
// ===============================
export const admittedSteps = [
  "Admitted at xx:xx，入院護理已完成。",
  "簡訊通知醫師，新病人已入院。",
  "/；由轉送人員協助轉送病人返室"
];

// ===============================
// 主邏輯：取得手動補全
// ===============================
export function getManualCompletion(text) {
  const last = getLastToken(text);

  // 生命徵象序列
  const idx = vitalSignsSequence.indexOf(last);
  if (idx !== -1 && idx < vitalSignsSequence.length - 1) {
    return {
      kind: "vitalSigns",
      step: idx,
      next: vitalSignsSequence[idx + 1]
    };
  }

  // GCS 連續補全
  if (gcsTriggerMap[last] !== undefined) {
    const step = gcsTriggerMap[last];
    return {
      kind: "gcsSeq",
      step,
      next: gcsSequence[step]
    };
  }

  // Admitted 多步驟
  if (last === "Admitted") {
    return {
      kind: "admitted",
      step: 0,
      next: admittedSteps[0]
    };
  }

  return null;
}

// ===============================
// 顯示補全 overlay
// ===============================
export function renderManualCompletion(text, overlay, aiRef, result) {
  aiRef.value = [result.next];
  aiRef.meta = result;

  overlay.innerHTML = `
    <span style="color: transparent;">${text}</span>
    <span style="color: #ccc;">${result.next}</span>
  `;
}

// ===============================
// Tab 接受後 → 自動跳下一個
// ===============================
export function handleAfterManualAccept(textarea, overlay, aiRef) {
  const meta = aiRef.meta;
  if (!meta) return;

  // 生命徵象：不連續觸發，只補一次
  if (meta.kind === "vitalSigns") {
    aiRef.value = [];
    aiRef.meta = null;
    return;
  }

  // GCS 連續補全
  if (meta.kind === "gcsSeq") {
    const nextStep = meta.step + 1;

    if (nextStep >= gcsSequence.length) {
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    const nextText = gcsSequence[nextStep];

    aiRef.value = [nextText];
    aiRef.meta = { kind: "gcsSeq", step: nextStep };

    overlay.innerHTML = `
      <span style="color: transparent;">${textarea.value}</span>
      <span style="color: #ccc;">${nextText}</span>
    `;
    return;
  }

  // Admitted 多步驟
  if (meta.kind === "admitted") {
    const nextStep = meta.step + 1;

    if (nextStep >= admittedSteps.length) {
      aiRef.value = [];
      aiRef.meta = null;
      return;
    }

    const nextText = admittedSteps[nextStep];

    aiRef.value = [nextText];
    aiRef.meta = { kind: "admitted", step: nextStep };

    overlay.innerHTML = `
      <span style="color: transparent;">${textarea.value}</span>
      <span style="color: #ccc;">${nextText}</span>
    `;
    return;
  }
}
