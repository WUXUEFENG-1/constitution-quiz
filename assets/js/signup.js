/* 注册页 */
(function () {
  API.configWarning();
  const form = document.getElementById("signupForm");
  const btn = document.getElementById("signupBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!API.sb) { API.toast("系统尚未配置数据库", "error"); return; }

    const fullName = document.getElementById("fullName").value.trim();
    const studentNo = document.getElementById("studentNo").value.trim();
    const department = document.getElementById("department").value.trim();
    const className = document.getElementById("className").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    const password2 = document.getElementById("password2").value;

    if (!fullName) return API.toast("请填写姓名", "error");
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(studentNo)) return API.toast("学号应为 4-20 位字母或数字", "error");
    if (!department || !className) return API.toast("请填写系部和班级", "error");
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) return API.toast("手机号格式不正确", "error");
    if (password.length < 6) return API.toast("密码至少 6 位", "error");
    if (password !== password2) return API.toast("两次输入的密码不一致", "error");

    btn.disabled = true;
    btn.textContent = "注册中…";
    try {
      const { data, error } = await API.sb.auth.signUp({
        email: API.toEmail(studentNo),
        password: password,
        options: {
          data: {
            full_name: fullName,
            student_no: studentNo,
            department: department,
            class_name: className,
            phone: phone
          }
        }
      });
      if (error) throw error;

      if (!data.session) {
        API.toast("注册成功，但账号需要邮箱确认，请联系管理员在后台关闭邮箱确认后重新登录", "error", 6000);
        btn.disabled = false;
        btn.textContent = "注册并进入选手中心";
        return;
      }

      API.toast("注册成功，正在进入选手中心", "success");
      setTimeout(() => location.replace("home.html"), 600);
    } catch (err) {
      const msg = String(err.message || err);
      const friendly =
        /already registered|already been registered|User already registered/i.test(msg)
          ? "该学号已注册，请直接登录；如忘记密码请联系管理员"
          : /Phone|invalid format/i.test(msg) ? "账号格式不正确，请检查学号"
          : /Password should be|at least/i.test(msg) ? "密码不符合要求（至少 6 位）"
          : msg;
      API.toast(friendly, "error", 3600);
      btn.disabled = false;
      btn.textContent = "注册并进入选手中心";
    }
  });
})();
