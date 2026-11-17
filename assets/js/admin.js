/* 管理后台外壳：登录守卫、权限、标签页、通用模态框 */
(function () {
  const PERM = {
    all: () => true,
    admin: (r) => r === "admin" || r === "sub_admin",
    questioner: (r) => ["admin", "sub_admin", "questioner"].includes(r),
    proctor: (r) => ["admin", "sub_admin", "proctor"].includes(r),
    statistician: (r) => ["admin", "sub_admin", "statistician"].includes(r)
  };

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
    document.getElementById("userChip").textContent =
      `${ctx.profile.full_name || "管理员"} · ${API.roleLabel(ctx.profile.role)}`;
    document.getElementById("logoutBtn").onclick = () => API.signOut();

    document.querySelectorAll(".tab").forEach((t) => {
      if (!Admin.can(t.dataset.perm)) t.style.display = "none";
    });

    document.getElementById("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    document.getElementById("modalClose").onclick = closeModal;
    document.getElementById("modalMask").onclick = (e) => { if (e.target.id === "modalMask") closeModal(); };

    await API.loadSettings();
    switchTab("overview");
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    ["overview", "users", "questions", "competitions", "monitor", "cheat", "appeals", "scores", "certs", "news", "logs", "settings"]
      .forEach((k) => { document.getElementById("panel-" + k).hidden = k !== tab; });
    const hook = Admin.hooks[tab];
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
