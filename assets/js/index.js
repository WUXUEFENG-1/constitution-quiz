/* 登录：账号密码 + 图形验证码，按角色跳转 */
(function () {
  let captchaOn = true;

  init();

  async function init() {
    API.applyBrand();
    await API.loadSettings();
    const sec = API.getSetting("security", {});
    captchaOn = sec.captcha !== false;
    document.getElementById("captchaField").style.display = captchaOn ? "" : "none";

    if (new URLSearchParams(location.search).get("kicked") === "1") {
      API.toast("账号已在其他设备登录，本端已退出", "error", 4000);
    }

    const canvas = document.getElementById("captchaCanvas");
    const refresh = () => API.newCaptcha(canvas);
    refresh();
    canvas.onclick = refresh;

    const session = await API.getSession();
    if (session) {
      const profile = await API.getProfile().catch(() => null);
      if (profile && profile.status !== "banned") {
        // 多端互踢：本地令牌与服务端不一致，说明已在别处登录，清掉会话回到登录页
        const local = API.sessionToken();
        const server = profile.session_token || "";
        if (server && local && local !== server) {
          await API.signOut(true);
        } else {
          if (!local && server) API.setSessionToken(server);
          location.replace(API.isStaff(profile.role) ? "admin.html" : "home.html");
          return;
        }
      }
    }

    document.getElementById("loginForm").onsubmit = onSubmit;

    const forgot = document.getElementById("forgotModal");
    const openForgot = () => { forgot.hidden = false; };
    const closeForgot = () => { forgot.hidden = true; };
    document.getElementById("forgotBtn").onclick = openForgot;
    document.getElementById("forgotClose").onclick = closeForgot;
    document.getElementById("forgotOk").onclick = closeForgot;
    forgot.onclick = (e) => { if (e.target.id === "forgotModal") closeForgot(); };

    initPromo();
  }

  function initPromo() {
    const track = document.getElementById("promoTrack");
    const dots = document.getElementById("promoDots");
    if (!track || !dots) return;
    const slides = track.children.length;
    const btns = [...dots.children];
    let cur = 0;
    const go = (i) => {
      cur = (i + slides) % slides;
      track.style.transform = `translateX(-${cur * 100}%)`;
      btns.forEach((d, k) => d.classList.toggle("on", k === cur));
    };
    btns.forEach((d, i) => (d.onclick = () => go(i)));
    if (slides > 1) setInterval(() => go(cur + 1), 5000);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const account = document.getElementById("account").value.trim();
    const password = document.getElementById("password").value;
    const captcha = document.getElementById("captcha").value;
    const btn = document.getElementById("loginBtn");

    if (!account || !password) return API.toast("请输入账号和密码", "error");
    if (captchaOn && !API.checkCaptcha(captcha)) {
      API.toast("验证码不正确，请重新输入", "error");
      API.newCaptcha(document.getElementById("captchaCanvas"));
      return;
    }

    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      const email = API.toEmail(account);
      const { data, error } = await API.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const profile = await API.getProfile();
      if (profile.status === "banned") {
        await API.sb.auth.signOut();
        return API.toast("账号已被禁用，请联系组委会", "error", 4000);
      }
      await API.logAction("登录", account);
      // 写入本设备会话令牌：新设备登录会顶掉旧设备
      await API.touchSession();

      const qs = new URLSearchParams(location.search);
      const redirect = qs.get("redirect");
      let target = API.isStaff(profile.role) ? "admin.html" : "home.html";
      if (redirect && /^[a-z\-]+\.html$/.test(redirect) && redirect !== "index.html") {
        target = redirect;
      }
      location.replace(target);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "登 录";
      const msg = String(err.message || err);
      const friendly = /Invalid login credentials/.test(msg) ? "学号或密码不正确，请检查后重试"
        : /Email not confirmed/.test(msg) ? "账号未激活，请联系管理员"
        : /Failed to fetch|NetworkError/.test(msg) ? "无法连接数据库，请检查网络或配置" : msg;
      API.toast("登录失败：" + friendly, "error", 3600);
      API.newCaptcha(document.getElementById("captchaCanvas"));
      document.getElementById("captcha").value = "";
    }
  }
})();
