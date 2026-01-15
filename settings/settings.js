function loadProfile() {
  const profile = JSON.parse(localStorage.getItem("profile") || "{}");
  document.getElementById("name").value = profile.name || "張護理師";
  document.getElementById("staffId").value = profile.staffId || "N001";
  document.getElementById("email").value = profile.email || "nurse.chang@hospital.com";
  document.getElementById("phone").value = profile.phone || "0912-345-678";
  document.getElementById("department").value = profile.department || "內科";
  document.getElementById("position").value = profile.position || "資深護理師";
}

function logout() {
  localStorage.removeItem("auth");
  localStorage.removeItem("username");
  location.href = "../index.html";
}

document.getElementById("settingsForm").onsubmit = e => {
  e.preventDefault();

  const newPwd = document.getElementById("newPwd").value;
  const confirmPwd = document.getElementById("confirmPwd").value;

  if (newPwd && newPwd !== confirmPwd) {
    alert("新密碼與確認密碼不一致");
    return;
  }

  const profile = {
    name: document.getElementById("name").value,
    staffId: document.getElementById("staffId").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    department: document.getElementById("department").value,
    position: document.getElementById("position").value
  };

  localStorage.setItem("profile", JSON.stringify(profile));
  alert("設定已更新");
};

loadProfile();
