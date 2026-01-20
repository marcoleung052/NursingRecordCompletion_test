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

  async function callAI(prompt) {
    const res = await apiFetch("/api/predict", {
      method: "POST",
      body: JSON.stringify({ prompt })
    });
    return res.completions;
  }

  const promptBox = document.getElementById("aiPrompt");
  const resultBox = document.getElementById("aiResults");

  promptBox.addEventListener("input", () => {
    clearTimeout(typingTimer);

    const text = promptBox.value.trim();
    if (!text) {
      resultBox.innerHTML = "";
      return;
    }

    typingTimer = setTimeout(async () => {
      resultBox.innerHTML = "<p>AI 正在生成中...</p>";

      try {
        const results = await callAI(text);

        resultBox.innerHTML = results
          .map((t, i) => `
            <div class="ai-option" data-text="${encodeURIComponent(t)}">
              <strong>建議 ${i + 1}</strong><br>${t}
            </div>
          `)
          .join("");

        document.querySelectorAll(".ai-option").forEach(opt => {
          opt.onclick = () => {
            const text = decodeURIComponent(opt.dataset.text);
            document.getElementById("content").value = text;
          };
        });

      } catch (err) {
        resultBox.innerHTML = `<p>AI 生成失敗：${err.message}</p>`;
      }

    }, delay);
  });
}
