import { apiFetch } from "../assets/js/api.js";

const params = new URLSearchParams(location.search);
const rid = params.get("rid");
const pid = params.get("pid");

async function loadRecord() {
  const r = await apiFetch(`/records/${pid}`);
  const record = r.find(x => x.id == rid);

  document.getElementById("datetime").value = record.created_at;
  document.getElementById("content").value = record.content;
}

document.getElementById("editRecordForm").onsubmit = async e => {
  e.preventDefault();

  const payload = {
    patient_id: Number(pid),
    nurse_id: 1,
    content: document.getElementById("content").value,
    created_at: document.getElementById("datetime").value
  };

  await apiFetch(`/records/${rid}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  alert("紀錄已更新");
  location.href = `patient_overview.html?id=${pid}`;
};

document.getElementById("backBtn").href = `patient_overview.html?id=${pid}`;

loadRecord();
