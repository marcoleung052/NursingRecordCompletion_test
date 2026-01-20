import { apiFetch } from "../assets/js/api.js";

// 載入護理師列表
async function loadNurses() {
  try {
    const nurses = await apiFetch("/nurses");
    const tbody = document.getElementById("nurseList");

    tbody.innerHTML = nurses.map(n => `
      <tr>
        <td>${n.id}</td>
        <td>${n.name}</td>
        <td>${n.staff_id}</td>
        <td>${n.department || ""}</td>
        <td>${n.position || ""}</td>
        <td>${n.phone || ""}</td>
        <td>${n.email || ""}</td>
      </tr>
    `).join("");

  } catch (err) {
    alert("無法載入護理師列表：" + err.message);
  }
}

// 新增護理師
document.getElementById("addNurseForm").onsubmit = async e => {
  e.preventDefault();

  const payload = {
    name: document.getElementById("name").value,
    staff_id: document.getElementById("staff_id").value,
    department: document.getElementById("department").value,
    position: document.getElementById("position").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value
  };

  try {
    await apiFetch("/nurses", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    alert("新增成功（預設密碼 = staff_id）");
    loadNurses();

  } catch (err) {
    alert("新增失敗：" + err.message);
  }
};

loadNurses();
document.addEventListener("click", async e => {
  if (e.target.classList.contains("delete-nurse")) {
    const id = e.target.dataset.id;

    if (!confirm("確定要刪除這位護理師嗎？")) return;

    await apiFetch(`/nurses/${id}`, { method: "DELETE" });
    alert("已刪除");
    loadNurses();
  }
});
