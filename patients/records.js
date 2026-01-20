import { apiFetch } from "../assets/js/api.js";

// ------------------ 護理紀錄列表頁 ------------------
if (location.pathname.includes("record_list.html")) {

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
  document.getElementById("backBtn").href = `patient_detail.html?id=${patientId}`;

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
const box = document.getElementById("aiSuggestBox");

let suggestions = [];
let activeIndex = 0;

// 呼叫 AI
async function callAI(prompt) {
  const res = await apiFetch("/api/predict", {
    method: "POST",
    body: JSON.stringify({ prompt })
  });
  return res.completions;
}

// 顯示建議列表
function showSuggestions(list) {
  suggestions = list;
  activeIndex = 0;

  box.innerHTML = list
    .map((s, i) => `
      <div class="ai-suggest-item ${i === 0 ? "active" : ""}" data-index="${i}">
        ${s}
      </div>
    `)
    .join("");

  const rect = textarea.getBoundingClientRect();
  box.style.top = rect.bottom + window.scrollY + "px";
  box.style.left = rect.left + window.scrollX + "px";
  box.style.width = rect.width + "px";
  box.style.display = "block";
}

// 接受補全
function acceptSuggestion() {
  const text = suggestions[activeIndex];
  textarea.value = text;
  hideSuggestions();
}

// 隱藏建議
function hideSuggestions() {
  box.style.display = "none";
  suggestions = [];
}

// 監聽輸入
textarea.addEventListener("input", () => {
  clearTimeout(typingTimer);

  const text = textarea.value.trim();
  if (!text) {
    hideSuggestions();
    return;
  }

  typingTimer = setTimeout(async () => {
    try {
      const results = await callAI(text);
      showSuggestions(results);
    } catch (err) {
      hideSuggestions();
    }
  }, delay);
});

// 鍵盤控制
textarea.addEventListener("keydown", (e) => {
  if (suggestions.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % suggestions.length;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    acceptSuggestion();
  }

  // 更新 active 樣式
  document.querySelectorAll(".ai-suggest-item").forEach((el, i) => {
    el.classList.toggle("active", i === activeIndex);
  });
});

// 滑鼠點擊接受
box.addEventListener("click", (e) => {
  const item = e.target.closest(".ai-suggest-item");
  if (!item) return;

  activeIndex = Number(item.dataset.index);
  acceptSuggestion();
});
