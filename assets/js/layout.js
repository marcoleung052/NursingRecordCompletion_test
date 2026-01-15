function renderHeader(username = "未登入") {
  const header = document.createElement("header");
  header.innerHTML = `
    <div class="header-bar">
      <div class="logo">
        <a href="../patients/patients.html" style="color:white;text-decoration:none;">🏥 護理紀錄系統</a>
      </div>
      <div class="user-info">
        <span>${username}</span>
        <a href="../settings/settings.html">系統設定</a>
      </div>
    </div>
  `;
  document.body.prepend(header);
}
