// 取得紀錄
function getRecords() {
  return JSON.parse(localStorage.getItem('records') || '{}');
}

// 儲存紀錄
function saveRecords(data) {
  localStorage.setItem('records', JSON.stringify(data));
}

// ------------------ 護理紀錄列表頁 ------------------
if (location.pathname.includes("record_list.html")) {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  const patient = JSON.parse(localStorage.getItem("patients"))
    .find(p => p.id == patientId);

  document.getElementById("patientInfo").innerHTML = `
    <p><strong>姓名：</strong>${patient.name}</p>
    <p><strong>病歷號：</strong>${patient.mrn}</p>
  `;

  document.getElementById("addRecordBtn").href =
    `add_record.html?id=${patientId}`;

  document.getElementById("backBtn").href =
    `../patients/patient_detail.html?id=${patientId}`;

  const allRecords = getRecords();
  const list = allRecords[patientId] || [];

  document.getElementById("recordList").innerHTML =
    list.map(r => `
      <tr>
        <td>${r.datetime}</td>
        <td>${r.content}</td>
      </tr>
    `).join("");
}

// ------------------ 新增護理紀錄頁 ------------------
if (location.pathname.includes("add_record.html")) {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  document.getElementById("backBtn").href =
    `record_list.html?id=${patientId}`;

  document.getElementById("recordForm").onsubmit = e => {
    e.preventDefault();

    const datetime = document.getElementById("datetime").value;
    const content = document.getElementById("content").value;

    const allRecords = getRecords();
    if (!allRecords[patientId]) allRecords[patientId] = [];

    allRecords[patientId].push({ datetime, content });
    saveRecords(allRecords);

    alert("新增成功");
    location.href = `record_list.html?id=${patientId}`;
  };
}
