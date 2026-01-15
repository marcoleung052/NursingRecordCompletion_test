function getPatients() {
  return JSON.parse(localStorage.getItem('patients') || '[]');
}

function renderList() {
  const keyword = document.getElementById("searchInput").value.trim();
  const dept = document.getElementById("deptFilter").value;
  const tbody = document.getElementById("patientList");
  const pagination = document.getElementById("pagination");

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
      <td><a href="patient_detail.html?id=${p.id}">查看</a></td>
    </tr>
  `).join("");

  pagination.textContent = `顯示 ${start + 1} 到 ${Math.min(end, all.length)} 筆，共 ${all.length} 筆病患資料`;
}

document.getElementById("searchInput").oninput = renderList;
document.getElementById("deptFilter").onchange = renderList;
renderList();
