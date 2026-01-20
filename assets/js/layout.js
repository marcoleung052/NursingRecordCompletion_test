// 讓 HTML 可以呼叫 requireLogin()
window.requireLogin = function () {
  const token = localStorage.getItem("token");
  if (!token) {
    location.href = "../index.html";
  }
};

import { apiFetch } from "./api.js";

// 自動載入 Header
async function initHeader() {
  const token = localStorage.getItem("token");

  let user = null;

  if (token === "admin") {
    user = { name: "Admin" };
  } else if (token) {
    try {
      user = await apiFetch(`/current-user?token=${token}`);
    } catch (err) {
      console.error("無法取得登入者資料");
    }
  }

  renderHeader(user?.name || "未登入");
}

initHeader();

// Header UI
function renderHeader(username = "未登入") {
  const isSubPage =
    location.pathname.includes("/patients/") ||
    location.pathname.includes("/records/") ||
    location.pathname.includes("/settings/") ||
    location.pathname.includes("/admin/");

  const homePath = isSubPage ? "../patients/patients.html" : "patients/patients.html";
  const settingsPath = isSubPage ? "../settings/settings.html" : "settings/settings.html";

  const header = document.createElement("header");
  header.innerHTML = `
    <div class="header-bar">
      <div class="logo">
        <a href="${homePath}" style="color:white;text-decoration:none;">護理紀錄系統</a>
      </div>
      <div class="user-info">
        <span>${username}</span>
        <a href="${settingsPath}">系統設定</a>
      </div>
    </div>
  `;
  document.body.prepend(header);
}
