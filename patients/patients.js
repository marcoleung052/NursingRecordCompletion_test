// 取得病患資料
function getPatients() {
  return JSON.parse(localStorage.getItem('patients') || '[]');
}

// 儲存病患資料
function savePatients(list) {
  localStorage.setItem('patients', JSON.stringify(list));
}

// ------------------ 病患列表頁 ------------------
if (location.pathname.includes("patients.html")) {
  const searchInput = document.getElementById("searchInput");
  const deptFilter = document.getElementById("deptFilter");
  const tbody = document.getElementById("patientList");
  const pagination = document.getElementById("pagination");

  function renderList() {
    const keyword = searchInput.value.trim();
    const dept = deptFilter.value;
    const all = getPatients().filter(p =>
      (p.name.includes(keyword) || p.mrn.includes(keyword)) &&
      (dept === "" || p.department === dept)
    );

    const pageSize = 10;
    const page = 1;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const list = all.slice(start, end);

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>${p.name}<br>${p.mrn}・${p.age}歲・${p.gender}</td>
        <td>${p.room}</td>
        <td>${p.department}</td>
        <td>${p.diagnosis}</td>
        <td>${p.risk}</td>
        <td>${p.doctor}</td>
        <td>${p.admitDate}</td>
        <td class="actions">
          <a class="btn-small" href="patient_detail.html?id=${p.id}">查看</a>
          <a class="btn-small-secondary" href="../records/add_record.html?id=${p.id}">編寫紀錄</a>
        </td>
      </tr>
    `).join("");

    pagination.textContent = `顯示 ${start + 1} 到 ${Math.min(end, all.length)} 筆，共 ${all.length} 筆病患資料`;
  }

  searchInput.oninput = renderList;
  deptFilter.onchange = renderList;
  renderList();
}

// ------------------ 新增病患頁 ------------------
if (location.pathname.includes("add_patient.html")) {
  document.getElementById("addForm").onsubmit = e => {
    e.preventDefault();

    const list = getPatients();
    const newPatient = {
      id: Date.now(),
      name: document.getElementById("name").value,
      mrn: document.getElementById("mrn").value,
      age: document.getElementById("age").value,
      gender: document.getElementById("gender").value,
      room: document.getElementById("room").value,
      department: document.getElementById("department").value,
      diagnosis: document.getElementById("diagnosis").value,
      risk: document.getElementById("risk").value,
      doctor: document.getElementById("doctor").value,
      admitDate: document.getElementById("admitDate").value
    };

    list.push(newPatient);
    savePatients(list);

    alert("新增成功");
    location.href = "patients.html";
  };
}

// ------------------ 病患詳細頁 ------------------
if (location.pathname.includes("patient_detail.html")) {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get("id"));
  const patient = getPatients().find(p => p.id === id);

  const box = document.getElementById("detailBox");
  box.innerHTML = `
    <p><strong>姓名：</strong>${patient.name}</p>
    <p><strong>病歷號：</strong>${patient.mrn}</p>
    <p><strong>年齡：</strong>${patient.age} 歲</p>
    <p><strong>性別：</strong>${patient.gender}</p>
    <p><strong>病房床號：</strong>${patient.room}</p>
    <p><strong>科別：</strong>${patient.department}</p>
    <p><strong>診斷：</strong>${patient.diagnosis}</p>
    <p><strong>風險等級：</strong>${patient.risk}</p>
    <p><strong>主治醫師：</strong>${patient.doctor}</p>
    <p><strong>入院日期：</strong>${patient.admitDate}</p>
  `;
const newPatient = {
  id: Date.now(),
  name: document.getElementById("name").value,
  birth: document.getElementById("birth").value,
  gender: document.getElementById("gender").value,
  phone: document.getElementById("phone").value,
  email: document.getElementById("email").value,

  emgName: document.getElementById("emgName").value,
  emgPhone: document.getElementById("emgPhone").value,
  emgRelation: document.getElementById("emgRelation").value,

  room: document.getElementById("room").value,
  department: document.getElementById("department").value,
  doctor: document.getElementById("doctor").value,
  diagnosis: document.getElementById("diagnosis").value,
  risk: document.getElementById("risk").value,
  admitDate: document.getElementById("admitDate").value
};
  document.getElementById("toRecords").href =
    `../records/record_list.html?id=${id}`;
}
const id = new URLSearchParams(location.search).get("id");

// 取得病患資料
fetch(`/patients/${id}`)
  .then(res => res.json())
  .then(p => {
    document.getElementById("p_name").textContent = p.name;
    document.getElementById("p_birth").textContent = p.birth;
    document.getElementById("p_gender").textContent = p.gender;
    document.getElementById("p_phone").textContent = p.phone;
    document.getElementById("p_email").textContent = p.email;

    document.getElementById("p_emg_name").textContent = p.emg_name;
    document.getElementById("p_emg_phone").textContent = p.emg_phone;
    document.getElementById("p_emg_relation").textContent = p.emg_relation;

    document.getElementById("p_room").textContent = p.room;
    document.getElementById("p_department").textContent = p.department;
    document.getElementById("p_doctor").textContent = p.doctor;
    document.getElementById("p_diagnosis").textContent = p.diagnosis;
    document.getElementById("p_risk").textContent = p.risk;
    document.getElementById("p_admit").textContent = p.admit_date;
  });

// 取得護理紀錄
fetch(`/records/${id}`)
  .then(res => res.json())
  .then(records => {
    const tbody = document.getElementById("recordBody");
    tbody.innerHTML = "";

    records.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.created_at}</td>
        <td>${r.content}</td>
        <td>${r.nurse_id}</td>
      `;
      tbody.appendChild(tr);
    });
  });

// 修改病人資料按鈕
document.getElementById("editPatientBtn").onclick = () => {
  location.href = `edit_patient.html?id=${id}`;
};

// 新增紀錄按鈕
document.getElementById("addRecordBtn").onclick = () => {
  location.href = `add_record.html?id=${id}`;
};
