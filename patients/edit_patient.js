const id = new URLSearchParams(location.search).get("id");

// 設定返回按鈕
document.getElementById("backBtn").href = `patient_overview.html?id=${id}`;
document.getElementById("cancelBtn").onclick = () => {
  location.href = `patient_overview.html?id=${id}`;
};

// 取得病患資料
fetch(`/patients/${id}`)
  .then(res => res.json())
  .then(p => {
    document.getElementById("name").value = p.name;
    document.getElementById("birth").value = p.birth;
    document.getElementById("gender").value = p.gender;
    document.getElementById("phone").value = p.phone;
    document.getElementById("email").value = p.email;

    document.getElementById("emg_name").value = p.emg_name;
    document.getElementById("emg_phone").value = p.emg_phone;
    document.getElementById("emg_relation").value = p.emg_relation;

    document.getElementById("room").value = p.room;
    document.getElementById("department").value = p.department;
    document.getElementById("doctor").value = p.doctor;
    document.getElementById("diagnosis").value = p.diagnosis;
    document.getElementById("risk").value = p.risk;
    document.getElementById("admit_date").value = p.admit_date;
  });

// 儲存變更
document.getElementById("editForm").onsubmit = (e) => {
  e.preventDefault();

  const updated = {
    name: name.value,
    birth: birth.value,
    gender: gender.value,
    phone: phone.value,
    email: email.value,

    emg_name: emg_name.value,
    emg_phone: emg_phone.value,
    emg_relation: emg_relation.value,

    room: room.value,
    department: department.value,
    doctor: doctor.value,
    diagnosis: diagnosis.value,
    risk: risk.value,
    admit_date: admit_date.value
  };

  fetch(`/patients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  })
  .then(res => res.json())
  .then(() => {
    alert("病患資料已更新");
    location.href = `patient_overview.html?id=${id}`;
  });
};

// 刪除病患
document.getElementById("deleteBtn").onclick = () => {
  if (!confirm("⚠️ 確定要刪除這位病患嗎？此動作無法復原。")) return;

  fetch(`/patients/${id}`, {
    method: "DELETE"
  })
  .then(() => {
    alert("病患已刪除");
    location.href = "patients.html"; // 返回病患管理頁
  });
};
