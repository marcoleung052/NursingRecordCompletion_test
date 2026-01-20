// patients/records.js
import { apiFetch } from "../assets/js/api.js";

// 取得紀錄（若仍有 localStorage fallback，可保留）
function localGetPatients() {
  return JSON.parse(localStorage.getItem('patients') || '[]');
}

// ------------------ 護理紀錄列表頁 ------------------
if (location.pathname.includes("record_list.html")) {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("id");

  async function loadPatientInfo() {
    try {
      const patient = await apiFetch(`/patients/${patientId}`);
      document.getElementById("patientInfo").innerHTML = `
        <p><strong>姓名：</strong>${patient.name || ""}</p>
        <p><strong>病歷號：</strong>${patient.mrn || ""}</p>
      `;
    } catch (err) {
      // fallback to localStorage if backend fails
      const patient = localGetPatients().find(p => p.id == patientId) || {};
      document.getElementById("patientInfo").innerHTML = `
        <p><strong>姓名：</strong>${patient.name || "—"}</p>
        <p><strong>病歷號：</strong>${patient.mrn || "—"}</p>
      `;
    }
  }

  async function loadRecords() {
    try {
      const records = await apiFetch(`/records/${patientId}`);
      document.getElementById("recordList").innerHTML =
        (records || []).map(r => `
          <tr>
            <td>${r.created_at || r.datetime || ""}</td>
            <td>${r.content || ""}</td>
          </tr>
        `).join("");
    } catch (err) {
      console.error("讀取紀錄失敗", err);
      document.getElementById("recordList").innerHTML = `<tr><td colspan="2">讀取紀錄失敗：${err.message}</td></tr>`;
    }
  }

  document.getElementById("addRecordBtn").href = `add_record.html?id=${patientId}`;
  document.getElementById("backBtn").href = `../patients/patient_detail.html?id=${patientId}`;

  loadPatientInfo();
  loadRecords();
}
const searchBox = document.getElementById("recordSearch");
if (searchBox) {
  searchBox.oninput = () => {
    const keyword = searchBox.value.trim();
    filterRecords(keyword);
  };
}

function filterRecords(keyword) {
  const rows = document.querySelectorAll("#recordBody tr");

  rows.forEach(row => {
    const text = row.innerText;
    row.style.display = text.includes(keyword) ? "" : "none";
  });
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

    const payload = {
      patient_id: Number(patientId),
      nurse_id: 1, // 若有登入系統，請改為實際 nurse_id
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
      console.error("新增紀錄失敗", err);
      alert("新增紀錄失敗：" + err.message);
    }
  };
}

import { apiFetch } from "../assets/js/api.js";

// 呼叫 AI 補全 API
async function callAICompletion(prompt) {
  const res = await apiFetch("/api/predict", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      model: "gpt2-nursing"
    })
  });

  return res.completions; // 回傳 3 個候選
}

// 綁定按鈕事件
document.getElementById("aiBtn").onclick = async () => {
  const prompt = document.getElementById("aiPrompt").value.trim();
  const box = document.getElementById("aiResults");

  if (!prompt) {
    alert("請先輸入內容");
    return;
  }

  box.innerHTML = "<p>AI 正在生成中...</p>";

  try {
    const results = await callAICompletion(prompt);

    box.innerHTML = results
      .map((text, i) => `
        <div class="ai-option" data-text="${encodeURIComponent(text)}">
          <strong>建議 ${i + 1}</strong><br>${text}
        </div>
      `)
      .join("");

    // 點擊候選 → 填入 textarea
    document.querySelectorAll(".ai-option").forEach(opt => {
      opt.onclick = () => {
        const text = decodeURIComponent(opt.dataset.text);
        document.getElementById("content").value = text; // ⭐ 填入紀錄內容欄位
      };
    });

  } catch (err) {
    box.innerHTML = `<p>AI 生成失敗：${err.message}</p>`;
  }
};
