import { apiFetch } from "../assets/js/api.js";

// ------------------ 護理紀錄列表頁 ------------------
if (location.pathname.includes("patients.html")) {

  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  async function loadPatientInfo() {
    try {
      const patient = await apiFetch(`/patients/${patientId}`);
      document.getElementById("patientInfo").innerHTML = `
        <p><strong>姓名：</strong>${patient.name}</p>
        <p><strong>病歷號：</strong>${patient.mrn}</p>
      `;
    } catch (err) {
      document.getElementById("patientInfo").innerHTML = `
        <p>無法載入病患資料</p>
      `;
    }
  }

  async function loadRecords() {
    try {
      const records = await apiFetch(`/records/${patientId}`);
      document.getElementById("recordList").innerHTML =
        records.map(r => `
          <tr>
            <td>${r.created_at || ""}</td>
            <td>${r.content || ""}</td>
            <td>
              <a class="btn" href="edit_record.html?id=${r.id}">編輯</a>
            </td>
          </tr>
        `).join("");

    } catch (err) {
      document.getElementById("recordBody").innerHTML = `
        <tr><td colspan="2">讀取紀錄失敗：${err.message}</td></tr>
      `;
    }
  }

  document.getElementById("addRecordBtn").href = `add_record.html?id=${patientId}`;
  document.getElementById("backBtn").href = `patient_overview.html?id=${patientId}`;

  loadPatientInfo();
  loadRecords();
}

// ------------------ 搜尋 ------------------
const searchBox = document.getElementById("recordSearch");
if (searchBox) {
  searchBox.oninput = () => {
    const keyword = searchBox.value.trim();
    const rows = document.querySelectorAll("#recordBody tr");
    rows.forEach(row => {
      row.style.display = row.innerText.includes(keyword) ? "" : "none";
    });
  };
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
    const nurseId = Number(localStorage.getItem("token"));

    const payload = {
      patient_id: Number(patientId),
      nurse_id: nurseId,
      content,
      created_at: datetime || new Date().toISOString()
    };

    try {
      await apiFetch('/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("新增成功");
      location.href = `patient_overview.html?id=${patientId}`;
    } catch (err) {
      alert("新增紀錄失敗：" + err.message);
    }
  };
}
// ------------------ 編輯護理紀錄頁 ------------------
if (location.pathname.includes("edit_record.html")) {

  const params = new URLSearchParams(location.search);
  const recordId = params.get("id");

  const timeInput = document.getElementById("time");
  const noteInput = document.getElementById("note");
  const overlay = document.getElementById("overlay");   // ⭐ 只宣告一次

  import("../assets/js/ai_helper.js").then(({ initAISuggestion }) => {
    initAISuggestion(noteInput, overlay);
  });


  async function loadRecord() {
    try {
      const record = await apiFetch(`/records/detail/${recordId}`);

      timeInput.value = record.created_at.slice(0, 16);
      noteInput.value = record.content;

      renderOverlay(record.content, "");
    } catch (err) {
      alert("無法載入紀錄：" + err.message);
    }
  }

  loadRecord();

  document.getElementById("editRecordForm").onsubmit = async e => {
    e.preventDefault();

    const payload = {
      content: noteInput.value,
      created_at: timeInput.value
    };

    try {
      await apiFetch(`/records/${recordId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      alert("更新成功");
      history.back();
    } catch (err) {
      alert("更新失敗：" + err.message);
    }
  };

  document.getElementById("cancelBtn").onclick = () => {
    history.back();
  };
}
