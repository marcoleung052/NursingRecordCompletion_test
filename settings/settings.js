const themeSelect = document.getElementById("themeSelect");
const saveBtn = document.getElementById("saveBtn");

// 載入設定
const savedTheme = localStorage.getItem("theme") || "light";
themeSelect.value = savedTheme;

// 儲存設定
saveBtn.onclick = () => {
  localStorage.setItem("theme", themeSelect.value);
  alert("設定已儲存");
};
