/* 选手中心：报名、赛事、公告、快捷入口、草稿板 */
(function () {
  let profile = null, registration = null, competitions = [], announcements = [];

  init();

  async function init() {
    try {
      const ctx = await API.guard("contestant");
      profile = ctx.profile;
    } catch (e) { return; }

    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();

    await Promise.all([loadRegistration(), loadCompetitions(), loadAnnouncements(), API.loadSettings()]);
    renderProfile();
    renderReg();
    renderHub();
    renderCompetitions();
    renderAnnouncements();
    renderCarousel();
  }

  function renderCarousel() {
    const box = document.getElementById("carousel");
    const track = document.getElementById("carouselTrack");
    const dots = document.getElementById("carouselDots");
    let slides = API.getSetting("carousel", []);
    if (!Array.isArray(slides) || !slides.length) {
      slides = [
        { title: "尊崇宪法 · 学法守法 知法用法", desc: "第二届“学宪法 讲宪法”校园知识竞赛线上答题平台，欢迎参赛。" },
        { title: "法治校园 · 依宪治国 依宪执政", desc: "学习宪法知识，弘扬法治精神，做尊法学法守法用法的青年学生。" }
      ];
    }
    track.innerHTML = slides.map((s, i) => `
      <div class="carousel-slide ${i % 2 ? "alt" : ""}">
        <div class="c-title">${API.escapeHtml(s.title || "")}</div>
        <div class="c-desc">${API.escapeHtml(s.desc || s.text || "")}</div>
      </div>`).join("");
    dots.innerHTML = slides.map((_, i) => `<button type="button" data-i="${i}" class="${i === 0 ? "on" : ""}"></button>`).join("");
    box.hidden = slides.length <= 1;
    let cur = 0;
    const go = (i) => {
      cur = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${cur * 100}%)`;
      dots.querySelectorAll("button").forEach((d, k) => d.classList.toggle("on", k === cur));
    };
    dots.querySelectorAll("button").forEach((d) => (d.onclick = () => go(Number(d.dataset.i))));
    if (slides.length > 1) setInterval(() => go(cur + 1), 6000);
  }

  async function loadRegistration() {
    const { data } = await API.sb
      .from("registrations")
      .select("*").eq("user_id", (await API.currentUser()).id).maybeSingle();
    registration = data;
  }

  async function loadCompetitions() {
    const { data } = await API.sb
      .from("competitions")
      .select("*").order("created_at", { ascending: false });
    competitions = data || [];
  }

  async function loadAnnouncements() {
    const { data } = await API.sb
      .from("announcements")
      .select("*").eq("is_published", true)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false });
    announcements = data || [];
  }

  function renderProfile() {
    document.getElementById("welcomeLine").textContent =
      `欢迎你，${profile.full_name || "同学"}。可先在线练习；完成报名后在开放时间内参赛。`;
    const items = [
      ["姓名", profile.full_name], ["学号", profile.student_no],
      ["系部", profile.department], ["班级", profile.class_name], ["手机号", profile.phone || "—"]
    ];
    document.getElementById("profileBox").innerHTML = items.map(([k, v]) =>
      `<div class="item"><div class="k">${k}</div><div class="v">${API.escapeHtml(v || "—")}</div></div>`).join("");
  }

  function renderReg() {
    const status = document.getElementById("regStatus");
    const action = document.getElementById("regAction");
    if (registration) {
      status.innerHTML = '<span class="badge green">已报名</span>';
      action.innerHTML = `<div class="notice ok" style="margin:0;flex:1">报名成功，时间：${API.fmtTime(registration.created_at)}。请留意开放时间按时参赛。</div><button class="btn ghost" id="cancelRegBtn">取消报名</button>`;
      document.getElementById("cancelRegBtn").onclick = doCancel;
    } else {
      status.innerHTML = '<span class="badge amber">未报名</span>';
      action.innerHTML = `<button class="btn" id="regBtn">立即报名参赛</button>`;
      document.getElementById("regBtn").onclick = doRegister;
    }
  }

  async function doCancel() {
    if (!confirm("确认取消报名？取消后可在开放时间内重新报名。")) return;
    const user = await API.currentUser();
    const { error } = await API.sb.from("registrations").delete().eq("user_id", user.id);
    if (error) return API.toast("取消报名失败：" + error.message, "error");
    API.toast("已取消报名", "success");
    await loadRegistration();
    renderReg();
    renderCompetitions();
  }

  async function doRegister() {
    const btn = document.getElementById("regBtn");
    btn.disabled = true; btn.textContent = "提交中…";
    try {
      const user = await API.currentUser();
      const { error } = await API.sb.from("registrations").insert({
        user_id: user.id, full_name: profile.full_name || "", student_no: profile.student_no || "",
        department: profile.department || "", class_name: profile.class_name || "", phone: profile.phone || ""
      });
      if (error) throw error;
      API.toast("报名成功", "success");
      await loadRegistration();
      renderReg();
      renderCompetitions();
    } catch (err) {
      API.toast("报名失败：" + (err.message || err), "error", 3600);
      btn.disabled = false; btn.textContent = "立即报名参赛";
    }
  }

  function renderHub() {
    const cards = [
      { icon: "✍️", title: "在线练习", desc: "随机抽题，即时查看答案与解析", href: "practice.html" },
      { icon: "⏱️", title: "答题入口", desc: "限时答题，提交后自动判分出分", href: "exam.html" },
      { icon: "🏆", title: "成绩与证书", desc: "历史成绩、错题回看、证书查看", href: "profile.html" },
      { icon: "📮", title: "提交申诉", desc: "题目或分数异议在线提交", href: "appeals.html" },
      { icon: "📝", title: "线上草稿板", desc: "随手记录，本地保存不丢失", href: "javascript:;", board: true }
    ];
    document.getElementById("hubGrid").innerHTML = cards.map((c, i) => `
      <a class="hub-card" href="${c.href}" data-board="${c.board ? 1 : 0}">
        <div class="ico">${c.icon}</div>
        <h3>${c.title}</h3><p>${c.desc}</p>
      </a>`).join("");
    document.querySelectorAll("[data-board]").forEach((el) => {
      el.onclick = (e) => {
        if (el.dataset.board === "1") { e.preventDefault(); toggleBoard(); }
      };
    });
  }

  function statusBadge(s) {
    const map = { open: ["开放中", "green"], closed: ["已结束", "gray"], draft: ["未开始", "amber"], finished: ["已结束", "gray"] };
    const [t, c] = map[s] || ["未知", "gray"];
    return `<span class="badge ${c}">${t}</span>`;
  }

  function renderCompetitions() {
    const box = document.getElementById("compList");
    if (!competitions.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">暂无赛事</div>'; return; }
    box.innerHTML = competitions.map((c, i) => `
      <div class="comp-card" style="margin-bottom:14px">
        <div class="comp-head">
          <div><h3>${API.escapeHtml(c.title)}</h3><div style="font-size:13px;color:var(--ink-3)">${API.escapeHtml(c.subtitle || "")}</div></div>
          <span style="margin-left:auto">${statusBadge(c.status)}</span>
        </div>
        <div class="comp-meta">
          <span>开放：<b>${c.start_at ? API.fmtTime(c.start_at) : "待定"}</b></span>
          <span>截止：<b>${c.end_at ? API.fmtTime(c.end_at) : "待定"}</b></span>
          <span>时长：<b>${c.duration_minutes ? c.duration_minutes + " 分钟" : "待定"}</b></span>
          <span>题量：<b>${c.question_count ? c.question_count + " 题" : "待定"}</b></span>
        </div>
        ${c.rules ? `<div class="section-note" style="margin-top:10px">规则：${API.escapeHtml(c.rules)}</div>` : ""}
        <div class="btn-row" style="margin-top:12px">
          ${!registration ? `<button class="btn soft sm" data-join="${c.id}">报名参赛</button>` : ""}
          ${c.status === "open"
            ? `<a class="btn sm" href="exam.html">进入答题</a>`
            : `<button class="btn ghost sm" disabled>尚未开放</button>`}
        </div>
      </div>`).join("");
    box.querySelectorAll("[data-join]").forEach((b) => b.onclick = doRegister);
  }

  function renderAnnouncements() {
    const box = document.getElementById("annList");
    if (!announcements.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">暂无公告</div>'; return; }
    box.innerHTML = announcements.map((a) => `
      <div class="news-item">
        <div class="t">${a.pinned ? '<span class="badge red pinned-tag" style="margin-right:6px">置顶</span>' : ""}${API.escapeHtml(a.title)}</div>
        <div class="meta">${{ notice: "通知", rule: "规则", result: "结果" }[a.kind] || "通知"} · ${API.fmtTime(a.created_at)}</div>
        <div class="body">${API.escapeHtml(a.content)}</div>
      </div>`).join("");
  }

  let boardOpen = false;
  function toggleBoard() {
    boardOpen = !boardOpen;
    let board = document.getElementById("draftBoard");
    if (!board) {
      board = document.createElement("div");
      board.id = "draftBoard"; board.className = "draft-board";
      board.innerHTML = `<div class="db-head"><span>草稿板</span><button class="link-btn" id="dbClose">收起</button></div>
        <textarea id="dbText" placeholder="记录思路、关键词…自动保存在本机"></textarea>`;
      document.body.appendChild(board);
      const ta = document.getElementById("dbText");
      ta.value = localStorage.getItem("xfjs_draft") || "";
      ta.oninput = () => localStorage.setItem("xfjs_draft", ta.value);
      document.getElementById("dbClose").onclick = toggleBoard;
    }
    board.style.display = boardOpen ? "" : "none";
  }
})();
