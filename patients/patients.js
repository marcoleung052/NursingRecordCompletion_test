// patients/patients.js
import { apiFetch } from "../assets/js/api.js";

// ------------------ 病患列表頁 ------------------
if (location.pathname.includes("patients.html")) {
  const searchInput = document.getElementById("searchInput");
  const deptFilter = document.getElementById("deptFilter");
  const tbody = document.getElementById("patientList");
  const pagination = document.getElementById("pagination");

  let currentPage = 1;
  const pageSize = 10;

  async function fetchPatients({ q = "", department = "", page = 1, page_size = pageSize } = {}) {
    const params = new URLSearchParams();
    if (q) params.append("q", q);
    if (department) params.append("department", department);
    params.append("page", page);
    params.append("page_size", page_size);

    return apiFetch(`/patients?${params.toString()}`);
  }

  async function renderList() {
    try {
      const keyword = searchInput.value.trim();
      const dept = deptFilter.value;
      const res = await fetchPatients({ q: keyword, department: dept, page: currentPage, page_size: pageSize });

      // 假設後端回傳陣列；若後端回傳 {items, total}，請調整下面程式
      const all = Array.isArray(res) ? res : (res.items || []);
      const total = Array.isArray(res) ? all.length : (res.total || all.length);

      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      const list = all.slice(start, end);

      tbody.innerHTML = list.map(p => `
        <tr>
          <td>${p.name || ""}<br>${p.mrn || ""}・${p.age || ""}歲・${p.gender || ""}</td>
          <td>${p.room || ""}</td>
          <td>${p.department || ""}</td>
          <td>${p.diagnosis || ""}</td>
          <td>${p.risk || ""}</td>
          <td>${p.doctor || ""}</td>
          <td>${p.admit_date || p.admitDate || ""}</td>
          <td class="actions">
            <a class="btn-small" href="patient_overview.html?id=${p.id}">查看</a>
            <a class="btn-small-secondary" href="../patients/add_record.html?id=${p.id}">編寫紀錄</a>
          </td>
        </tr>
      `).join("");

      pagination.textContent = `顯示 ${Math.min(start + 1, total)} 到 ${Math.min(end, total)} 筆，共 ${total} 筆病患資料`;
    } catch (err) {
      console.error("取得病患清單失敗", err);
      tbody.innerHTML = `<tr><td colspan="8">取得病患清單失敗：${err.message}</td></tr>`;
      pagination.textContent = "";
    }
  }

  searchInput.oninput = () => { currentPage = 1; renderList(); };
  deptFilter.onchange = () => { currentPage = 1; renderList(); };

  // 初次載入
  renderList();
}

// ------------------ 新增病患頁 ------------------
if (location.pathname.includes("add_patient.html")) {
  document.getElementById("addForm").onsubmit = async e => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("name").value,
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
      await apiFetch('/patients', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("新增成功");
      location.href = "patients.html";
    } catch (err) {
      console.error("新增病患失敗", err);
      alert("新增失敗：" + err.message);
    }
  };
}
// ------------------ 病患詳細頁 ------------------
if (location.pathname.includes("patient_detail.html") || location.pathname.includes("patient_overview.html")) {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  async function loadPatient() {
    try {
      const p = await apiFetch(`/patients/${id}`);
      if (!p) {
        document.getElementById("detailBox").innerHTML = "<p>找不到病患資料</p>";
        return;
      }

      document.getElementById("p_name").textContent = p.name || "";
      document.getElementById("p_birth").textContent = p.birth || "";
      document.getElementById("p_gender").textContent = p.gender || "";
      document.getElementById("p_phone").textContent = p.phone || "";
      document.getElementById("p_email").textContent = p.email || "";

      document.getElementById("p_emg_name").textContent = p.emg_name || "";
      document.getElementById("p_emg_phone").textContent = p.emg_phone || "";
      document.getElementById("p_emg_relation").textContent = p.emg_relation || "";

      document.getElementById("p_room").textContent = p.room || "";
      document.getElementById("p_department").textContent = p.department || "";
      document.getElementById("p_doctor").textContent = p.doctor || "";
      document.getElementById("p_diagnosis").textContent = p.diagnosis || "";
      document.getElementById("p_risk").textContent = p.risk || "";
      document.getElementById("p_admit").textContent = p.admit_date || p.admitDate || "";
    } catch (err) {
      console.error("讀取病患失敗", err);
      document.getElementById("detailBox").innerHTML = `<p>讀取病患失敗：${err.message}</p>`;
    }
  }

  // 取得護理紀錄
  async function loadRecords() {
    try {
      const records = await apiFetch(`/records/${id}`);
      const tbody = document.getElementById("recordBody");
      tbody.innerHTML = "";
      (records || []).forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.created_at || r.datetime || ""}</td>
          <td>${r.content || ""}</td>
          <td>${r.nurse_id || ""}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error("讀取紀錄失敗", err);
      const tbody = document.getElementById("recordBody");
      tbody.innerHTML = `<tr><td colspan="3">讀取紀錄失敗：${err.message}</td></tr>`;
    }
  }

  document.getElementById("editPatientBtn").onclick = () => {
    location.href = `edit_patient.html?id=${id}`;
  };

  document.getElementById("addRecordBtn").onclick = () => {
    location.href = `../patients/add_record.html?id=${id}`;
  };

  // 初次載入
  loadPatient();
  loadRecords();
}
