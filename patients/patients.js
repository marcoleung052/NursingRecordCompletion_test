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
  const tbody = document.getElementById("patientList");
  const searchInput = document.getElementById("searchInput");

  function renderList() {
    const keyword = searchInput.value.trim();
    const list = getPatients().filter(p =>
      p.name.includes(keyword) || p.mrn.includes(keyword)
    );

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.gender}</td>
        <td>${p.birthday}</td>
        <td>${p.mrn}</td>
        <td><a href="patient_detail.html?id=${p.id}">查看</a></td>
      </tr>
    `).join("");
  }

  searchInput.oninput = renderList;
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
      gender: document.getElementById("gender").value,
      birthday: document.getElementById("birthday").value,
      mrn: document.getElementById("mrn").value
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
    <p><strong>性別：</strong>${patient.gender}</p>
    <p><strong>生日：</strong>${patient.birthday}</p>
    <p><strong>病歷號：</strong>${patient.mrn}</p>
  `;

  document.getElementById("toRecords").href =
    `../records/record_list.html?id=${id}`;
}
