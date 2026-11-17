/* 管理后台外壳：登录守卫、权限、侧边栏菜单、通用模态框 */
(function () {
  const PERM = {
    all: () => true,
    admin: (r) => r === "admin" || r === "sub_admin",
    questioner: (r) => ["admin", "sub_admin", "questioner"].includes(r),
    proctor: (r) => ["admin", "sub_admin", "proctor"].includes(r),
    statistician: (r) => ["admin", "sub_admin", "statistician"].includes(r)
  };

  /* 侧边栏别名 → 实际面板/钩子 */
  const ALIAS = { roles: "users" };
  const PANELS = ["overview", "users", "questions", "competitions", "papers", "monitor", "cheat", "scores", "rank", "classrank", "appeals", "certs", "news", "logs", "settings"];

  const Admin = {
    profile: null,
    hooks: {},
    can(perm) { return PERM[perm] ? PERM[perm](this.profile.role) : true; },
    register(tab, hook) { this.hooks[tab] = hook; }
  };
  window.Admin = Admin;

  init();

  async function init() {
    let ctx;
    try { ctx = await API.guard("staff"); } catch (e) { return; }
    Admin.profile = ctx.profile;
    document.body.classList.remove("admin-loading");
    document.getElementById("userChip").textContent =
      `${ctx.profile.full_name || "管理员"} · ${API.roleLabel(ctx.profile.role)}`;
    document.getElementById("logoutBtn").onclick = () => API.signOut();
    fitPageHead();
    window.addEventListener("resize", fitPageHead);
    window.addEventListener("load", fitPageHead);

    document.querySelectorAll(".side-item").forEach((t) => {
      if (!Admin.can(t.dataset.perm)) t.style.display = "none";
    });

    document.getElementById("sideNav").addEventListener("click", (e) => {
      const btn = e.target.closest(".side-item");
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    closeModal();
    document.getElementById("modalClose").onclick = closeModal;
    document.getElementById("modalMask").onclick = (e) => { if (e.target.id === "modalMask") closeModal(); };

    await API.loadSettings();
    switchTab("overview");
  }

  /* 标题栏吸顶偏移 = 头部实际高度；固定导航栏停靠在头部正下方 */
  function fitPageHead() {
    const hdr = document.querySelector(".site-header");
    const ph = document.querySelector(".admin-pagehead");
    const side = document.querySelector(".admin-side");
    if (hdr && ph) ph.style.top = hdr.offsetHeight + "px";
    if (hdr && side) side.style.setProperty("--rail-top", hdr.offsetHeight + "px");
  }

  function switchTab(tab) {
    const real = ALIAS[tab] || tab;
    document.querySelectorAll(".side-item").forEach((x) =>
      x.classList.toggle("active", x.dataset.tab === tab));
    PANELS.forEach((k) => { document.getElementById("panel-" + k).hidden = k !== real; });
    const hook = Admin.hooks[real];
    if (hook && typeof hook.load === "function") {
      Promise.resolve(hook.load()).catch((err) => API.toast("加载失败：" + (err.message || err), "error"));
    }
  }

  function openModal(title, bodyHtml, footNodes) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = bodyHtml;
    const foot = document.getElementById("modalFoot");
    foot.innerHTML = "";
    (footNodes || []).forEach((n) => foot.appendChild(n));
    document.getElementById("modalMask").hidden = false;
  }
  function closeModal() { document.getElementById("modalMask").hidden = true; }

  Admin.openModal = openModal;
  Admin.closeModal = closeModal;
  Admin.btn = function (text, cls, onClick) {
    const b = document.createElement("button");
    b.className = "btn " + (cls || "");
    b.textContent = text;
    b.onclick = onClick;
    return b;
  };
})();
