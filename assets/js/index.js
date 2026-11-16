/* 登录页 */
(function () {
  API.configWarning();
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");

  function redirectTo(role) {
    const q = new URLSearchParams(location.search);
    const target = q.get("redirect");
    if (role === "admin") return location.replace("admin.html");
    if (target && /^[a-z]+\.html$/.test(target)) return location.replace(target);
    location.replace("dashboard.html");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!API.sb) { API.toast("系统尚未配置数据库", "error"); return; }

    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    if (!account || !password) { API.toast("请填写学号和密码", "error"); return; }

    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      const { data, error } = await API.sb.auth.signInWithPassword({
        email: API.toEmail(account),
        password: password
      });
      if (error) throw error;

      const profile = await API.getProfile();
      API.toast("登录成功", "success");
      setTimeout(() => redirectTo(profile && profile.role), 400);
    } catch (err) {
      const msg = String(err.message || err);
      const friendly =
        /Invalid login credentials/.test(msg) ? "学号或密码不正确，请检查后重试"
        : /Email not confirmed/.test(msg) ? "账号未激活，请联系管理员"
        : /Failed to fetch|NetworkError/.test(msg) ? "无法连接数据库，请检查网络或配置"
        : msg;
      API.toast(friendly, "error", 3200);
      btn.disabled = false;
      btn.textContent = "登 录";
    }
  });
})();
