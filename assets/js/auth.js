// 未登入 → 自動跳回登入頁
if (!localStorage.getItem("token"))  {
  if (!location.pathname.includes("index.html")) {
    location.href = "../index.html";
  }
}
