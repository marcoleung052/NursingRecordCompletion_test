// ------------------ Login 保護 ------------------
window.requireLogin = function () {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("你沒有登入，請重新登入");
    location.href = "../index.html";
    return false;
  }
  return true;
};

// ------------------ Logout ------------------
window.logout = function () {
  localStorage.removeItem("token");
  location.href = "../index.html";
};

import { apiFetch } from "./api.js";

// ------------------ Header ------------------
async function initHeader() {

  if (!localStorage.getItem("token")) return;

  const token = localStorage.getItem("token");
  let user = null;

  if (token === "admin") {
    user = { name: "Admin" };
  } else {
    try {
      user = await apiFetch(`/nurses/${token}`);
    } catch (err) {
      console.error("無法取得登入者資料");
    }
  }

  renderHeader(user?.name || "未登入");
}

initHeader();

function renderHeader(username = "未登入") {
  const isSubPage =
    location.pathname.includes("/patients/") ||
    location.pathname.includes("/records/") ||
    location.pathname.includes("/settings/") ||
    location.pathname.includes("/admin/");

  const homePath = isSubPage ? "../patients/patients.html" : "patients/patients.html";
  const settingsPath = isSubPage ? "../settings/settings.html" : "settings/settings.html";

  const token = localStorage.getItem("token");

  const rightMenu =
    token === "admin"
      ? `<a href="#" id="logoutLink">登出</a>`
      : `<a href="${settingsPath}">系統設定</a>`;

  const header = document.createElement("header");
  header.innerHTML = `
    <div class="header-bar">
      <div class="logo">
        <a href="${homePath}" style="color:white;text-decoration:none;">護理紀錄系統</a>
      </div>
      <div class="user-info">
        <span>${username}</span>
        ${rightMenu}
      </div>
    </div>
  `;
  document.body.prepend(header);

  if (token === "admin") {
    document.getElementById("logoutLink").onclick = () => {
      window.logout();
    };
  }
}
