// patients/records.js
import { apiFetch } from "../assets/js/api.js";

// 取得紀錄（若仍有 localStorage fallback，可保留）
function localGetPatients() {
  return JSON.parse(localStorage.getItem('patients') || '[]');
}

// ------------------ 護理紀錄列表頁 ------------------
if (location.pathname.includes("record_list.html")) {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  async function loadPatientInfo() {
    try {
      const patient = await apiFetch(`/patients/${patientId}`);
      document.getElementById("patientInfo").innerHTML = `
        <p><strong>姓名：</strong>${patient.name || ""}</p>
        <p><strong>病歷號：</strong>${patient.mrn || ""}</p>
      `;
    } catch (err) {
      // fallback to localStorage if backend fails
      const patient = localGetPatients().find(p => p.id == patientId) || {};
      document.getElementById("patientInfo").innerHTML = `
        <p><strong>姓名：</strong>${patient.name || "—"}</p>
        <p><strong>病歷號：</strong>${patient.mrn || "—"}</p>
      `;
    }
  }

  async function loadRecords() {
    try {
      const records = await apiFetch(`/records/${patientId}`);
      document.getElementById("recordList").innerHTML =
        (records || []).map(r => `
          <tr>
            <td>${r.created_at || r.datetime || ""}</td>
            <td>${r.content || ""}</td>
          </tr>
        `).join("");
    } catch (err) {
      console.error("讀取紀錄失敗", err);
      document.getElementById("recordList").innerHTML = `<tr><td colspan="2">讀取紀錄失敗：${err.message}</td></tr>`;
    }
  }

  document.getElementById("addRecordBtn").href = `add_record.html?id=${patientId}`;
  document.getElementById("backBtn").href = `../patients/patient_detail.html?id=${patientId}`;

  loadPatientInfo();
  loadRecords();
}

// ------------------ 新增護理紀錄頁 ------------------
if (location.pathname.includes("add_record.html")) {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  document.getElementById("backBtn").href = `patient_overview.html?id=${patientId}`;

  document.getElementById("recordForm").onsubmit = async e => {
    e.preventDefault();

    const datetime = document.getElementById("datetime").value;
    const content = document.getElementById("content").value;

    const payload = {
      patient_id: Number(patientId),
      nurse_id: 1, // 若有登入系統，請改為實際 nurse_id
      content,
      created_at: datetime || new Date().toISOString()
    };

    try {
      await apiFetch('/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("新增成功");
      location.href = `record_list.html?id=${patientId}`;
    } catch (err) {
      console.error("新增紀錄失敗", err);
      alert("新增紀錄失敗：" + err.message);
    }
  };
}
