import { apiFetch } from "../assets/js/api.js";

function logout() {
  localStorage.removeItem("token");
  location.href = "../index.html";
}

window.logout = logout; // ⭐ 讓 HTML 可以呼叫 logout()

async function loadProfile() {
  const token = localStorage.getItem("token");

  if (token === "admin") {
    alert("管理員不能使用系統設定頁");
    location.href = "../admin/admin.html";
    return;
  }

  const nurse = await apiFetch(`/current-user?token=${token}`);

  document.getElementById("name").value = nurse.name;
  document.getElementById("staffId").value = nurse.staff_id;
  document.getElementById("email").value = nurse.email || "";
  document.getElementById("phone").value = nurse.phone || "";
  document.getElementById("department").value = nurse.department || "";
  document.getElementById("position").value = nurse.position || "";
  document.getElementById("account").value = nurse.staff_id;
}

loadProfile();

document.getElementById("settingsForm").onsubmit = async e => {
  e.preventDefault();

  const token = localStorage.getItem("token");

  const payload = {
    name: document.getElementById("name").value,
    staff_id: document.getElementById("staffId").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    department: document.getElementById("department").value,
    position: document.getElementById("position").value
  };

  const newPwd = document.getElementById("newPwd").value;
  const confirmPwd = document.getElementById("confirmPwd").value;

  if (newPwd) {
    if (newPwd !== confirmPwd) {
      alert("新密碼與確認密碼不一致");
      return;
    }
    payload.password = newPwd;
  }

  await apiFetch(`/nurses/${token}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  alert("設定已更新");
};
