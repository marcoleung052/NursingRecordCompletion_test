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
          </tr>
        `).join("");
    } catch (err) {
      document.getElementById("recordList").innerHTML = `
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

  document.getElementById("backBtn").href = `patient_detail.html?id=${patientId}`;

  document.getElementById("recordForm").onsubmit = async e => {
    e.preventDefault();

    const datetime = document.getElementById("datetime").value;
    const content = document.getElementById("content").value;

    const payload = {
      patient_id: Number(patientId),
      nurse_id: 1,
      content,
      created_at: datetime || new Date().toISOString()
    };

    try {
      await apiFetch('/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert("新增成功");
      location.href = `patient_detail.html?id=${patientId}`;
    } catch (err) {
      alert("新增紀錄失敗：" + err.message);
    }
  };

  // ------------------ AI 補全 ------------------
let typingTimer = null;
const delay = 1000;

const textarea = document.getElementById("content");

let suggestions = [];
let activeIndex = 0;
let isLoading = false;

// 呼叫 AI
async function callAI(prompt) {
  isLoading = true;
  updateGhost("(正在補全…)");

  try {
    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });
    suggestions = res.completions;
    activeIndex = 0;
    updateGhost(suggestions[0]?.slice(prompt.length) || "");
  } catch (err) {
    updateGhost("");
  }

  isLoading = false;
}

// 更新 ghost text
function updateGhost(text) {
  textarea.setAttribute("data-ghost", text);
}

// 接受補全
function acceptSuggestion() {
  const base = textarea.value;
  const full = suggestions[activeIndex] || base;
  textarea.value = full;
  updateGhost("");
}

// 監聽輸入
textarea.addEventListener("input", () => {
  clearTimeout(typingTimer);

  const text = textarea.value.trim();
  if (!text) {
    updateGhost("");
    return;
  }

  typingTimer = setTimeout(() => {
    callAI(text);
  }, delay);
});

// 鍵盤控制
textarea.addEventListener("keydown", (e) => {
  if (suggestions.length === 0 || isLoading) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % suggestions.length;
    updateGhost(suggestions[activeIndex].slice(textarea.value.length));
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
    updateGhost(suggestions[activeIndex].slice(textarea.value.length));
  }

  if (e.key === "Tab") {
    e.preventDefault();
    acceptSuggestion();
  }
});
}
