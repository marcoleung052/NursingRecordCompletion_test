import { apiFetch } from "../assets/js/api.js";

// 取得 URL 參數
const url = new URL(window.location.href);
const rid = url.searchParams.get("rid");
const pid = url.searchParams.get("pid");

// 載入紀錄內容
async function loadRecord() {
  if (!rid || !pid) {
    alert("缺少必要參數 rid 或 pid");
    return;
  }

  try {
    const record = await apiFetch(`/records/${rid}`);

    document.getElementById("recordId").value = record.id;
    document.getElementById("patientId").value = record.patient_id;
    document.getElementById("note").value = record.note;

    // 時間格式轉換成 datetime-local 可用格式
    const dt = new Date(record.time);
    document.getElementById("time").value = dt.toISOString().slice(0, 16);

  } catch (err) {
    alert("無法載入紀錄：" + err.message);
  }
}

loadRecord();

// 儲存更新
document.getElementById("editRecordForm").onsubmit = async e => {
  e.preventDefault();

  const payload = {
    note: document.getElementById("note").value,
    time: document.getElementById("time").value,
    patient_id: Number(pid)
  };

  try {
    await apiFetch(`/records/${rid}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    alert("紀錄已更新");
    location.href = `patient_detail.html?pid=${pid}`;

  } catch (err) {
    alert("更新失敗：" + err.message);
  }
};

// 取消 → 回到病患頁面
document.getElementById("cancelBtn").onclick = () => {
  location.href = `patient_detail.html?pid=${pid}`;
};
