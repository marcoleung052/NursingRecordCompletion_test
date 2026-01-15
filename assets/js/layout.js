function renderHeader(username = "未登入") {

  // 判斷目前頁面是否在子資料夾
  const isSubPage = location.pathname.includes("/patients/") ||
                    location.pathname.includes("/records/") ||
                    location.pathname.includes("/settings/");

  // 根據層級決定正確路徑
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
