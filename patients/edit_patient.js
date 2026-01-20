import { apiFetch } from "../assets/js/api.js";

if (location.pathname.includes("edit_patient.html")) {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  async function loadPatient() {
    try {
      const p = await apiFetch(`/patients/${id}`);

      document.getElementById("name").value = p.name || "";
      document.getElementById("mrn").value = p.mrn || "";
      document.getElementById("birth").value = p.birth || "";
      document.getElementById("gender").value = p.gender || "";
      document.getElementById("phone").value = p.phone || "";
      document.getElementById("email").value = p.email || "";

      document.getElementById("emgName").value = p.emg_name || "";
      document.getElementById("emgPhone").value = p.emg_phone || "";
      document.getElementById("emgRelation").value = p.emg_relation || "";

      document.getElementById("room").value = p.room || "";
      document.getElementById("department").value = p.department || "";
      document.getElementById("doctor").value = p.doctor || "";
      document.getElementById("diagnosis").value = p.diagnosis || "";
      document.getElementById("risk").value = p.risk || "";
      document.getElementById("admitDate").value = p.admit_date || "";
    } catch (err) {
      alert("讀取病患資料失敗");
    }
  }

  // 儲存變更
  document.getElementById("saveBtn").onclick = async () => {
    const payload = {
      name: document.getElementById("name").value,
      mrn: document.getElementById("mrn").value,
      birth: document.getElementById("birth").value,
      gender: document.getElementById("gender").value,
      phone: document.getElementById("phone").value,
      email: document.getElementById("email").value,

      emg_name: document.getElementById("emgName").value,
      emg_phone: document.getElementById("emgPhone").value,
      emg_relation: document.getElementById("emgRelation").value,

      room: document.getElementById("room").value,
      department: document.getElementById("department").value,
      doctor: document.getElementById("doctor").value,
      diagnosis: document.getElementById("diagnosis").value,
      risk: document.getElementById("risk").value,
      admit_date: document.getElementById("admitDate").value
    };

    try {
      await apiFetch(`/patients/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      alert("已儲存變更");
      location.href = `patient_overview.html?id=${id}`;
    } catch (err) {
      alert("儲存失敗：" + err.message);
    }
  };

  // 刪除病患
  document.getElementById("deleteBtn").onclick = async () => {
    if (!confirm("確定要刪除這位病患嗎？")) return;

    try {
      await apiFetch(`/patients/${id}`, { method: "DELETE" });
      alert("病患已刪除");
      location.href = "patients.html";
    } catch (err) {
      alert("刪除失敗：" + err.message);
    }
  };

  // 返回病患資料
  document.getElementById("backBtn").onclick = () => {
    location.href = `patient_overview.html?id=${id}`;
  };

  loadPatient();
}
