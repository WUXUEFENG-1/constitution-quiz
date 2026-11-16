/* 选手中心 */
(function () {
  let ctx = { profile: null, settings: null, registration: null, attempt: null };

  init();

  async function init() {
    try {
      const { profile } = await API.guard("contestant");
      ctx.profile = profile;
      document.getElementById("userChip").textContent = profile.full_name || "选手";
      document.getElementById("welcomeLine").textContent =
        `欢迎你，${profile.full_name || "同学"}。请先完成报名，再按开放时间进入答题。`;

      renderProfile();
      await Promise.all([loadRegistration(), loadSettings()]);
      await loadAttempt();
      renderExamEntry();
    } catch (e) {
      if (e && /no-session|not-admin|not-configured/.test(String(e.message))) return;
      console.error(e);
      API.toast("页面加载失败：" + (e.message || e), "error", 4000);
    }

    document.getElementById("logoutBtn").onclick = () => API.signOut();
    document.getElementById("practiceBtn").onclick = () => {
      const c = document.getElementById("practiceCount").value;
      const t = document.getElementById("practiceType").value;
      location.href = `practice.html?count=${c}&type=${t}`;
    };
  }

  function renderProfile() {
    const p = ctx.profile;
    const items = [
      ["姓名", p.full_name || "—"],
      ["学号", p.student_no || "—"],
      ["系部 / 学院", p.department || "—"],
      ["班级", p.class_name || "—"]
    ];
    document.getElementById("profileGrid").innerHTML = items
      .map(([k, v]) => `<div><div style="font-size:12.5px;color:var(--ink-3)">${k}</div>
        <div style="font-size:15px;font-weight:600;color:var(--blue-900);margin-top:2px">${API.escapeHtml(v)}</div></div>`)
      .join("");
  }

  async function loadRegistration() {
    const user = await API.currentUser();
    const { data, error } = await API.sb
      .from("registrations")
      .select("id, full_name, student_no, department, class_name, phone, created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    ctx.registration = data;

    const statusEl = document.getElementById("regStatus");
    const actionEl = document.getElementById("regAction");

    if (data) {
      statusEl.innerHTML = '<span class="badge green">已报名</span>';
      actionEl.innerHTML =
        `<div class="notice ok">报名成功，时间：${API.fmtTime(data.created_at)}。请留意答题开放时间，按时参赛。</div>`;
    } else {
      statusEl.innerHTML = '<span class="badge amber">未报名</span>';
      actionEl.innerHTML =
        `<div class="notice warn" style="margin-bottom:12px">你还没有完成报名。报名后成绩才纳入评奖统计。</div>
         <button class="btn" id="regBtn">立即报名参赛</button>`;
      document.getElementById("regBtn").onclick = doRegister;
    }
  }

  async function doRegister() {
    const btn = document.getElementById("regBtn");
    btn.disabled = true;
    btn.textContent = "提交中…";
    try {
      const user = await API.currentUser();
      const p = ctx.profile;
      const { error } = await API.sb.from("registrations").insert({
        user_id: user.id,
        full_name: p.full_name || "",
        student_no: p.student_no || "",
        department: p.department || "",
        class_name: p.class_name || "",
        phone: p.phone || ""
      });
      if (error) throw error;
      API.toast("报名成功", "success");
      await loadRegistration();
    } catch (err) {
      API.toast("报名失败：" + (err.message || err), "error", 3600);
      btn.disabled = false;
      btn.textContent = "立即报名参赛";
    }
  }

  async function loadSettings() {
    const { data, error } = await API.sb
      .from("exam_settings")
      .select("is_open, start_at, end_at, duration_minutes, question_count, note")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    ctx.settings = data || {};
  }

  async function loadAttempt() {
    const user = await API.currentUser();
    const { data, error } = await API.sb
      .from("attempts")
      .select("id, score, total_score, correct_count, question_count, status, started_at, submitted_at, duration_seconds, detail")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    ctx.attempt = data;
  }

  function renderExamEntry() {
    const s = ctx.settings || {};
    const badge = document.getElementById("examStateBadge");
    const info = document.getElementById("examInfo");
    const action = document.getElementById("examAction");
    const now = Date.now();
    const start = s.start_at ? new Date(s.start_at).getTime() : null;
    const end = s.end_at ? new Date(s.end_at).getTime() : null;

    let open = !!s.is_open;
    if (open && start && now < start) open = false;
    if (open && end && now > end) open = false;

    badge.innerHTML = open
      ? '<span class="badge green">开放中</span>'
      : '<span class="badge gray">未开放</span>';

    info.innerHTML = `
      <div class="grid-3" style="gap:10px">
        <div><div style="font-size:12.5px;color:var(--ink-3)">开放时间</div>
          <div style="font-weight:600">${s.start_at ? API.fmtTime(s.start_at) : "待定"}</div></div>
        <div><div style="font-size:12.5px;color:var(--ink-3)">截止时间</div>
          <div style="font-weight:600">${s.end_at ? API.fmtTime(s.end_at) : "待定"}</div></div>
        <div><div style="font-size:12.5px;color:var(--ink-3)">答题时长 / 抽题</div>
          <div style="font-weight:600">${s.duration_minutes || 30} 分钟 / ${s.question_count || 40} 题</div></div>
      </div>
      ${s.note ? `<div class="notice" style="margin-top:12px">${API.escapeHtml(s.note)}</div>` : ""}`;

    renderResult();

    const a = ctx.attempt;
    if (a && a.status === "submitted") {
      action.innerHTML = `<button class="btn ghost" disabled>本次答卷已提交</button>
        <span style="font-size:13px;color:var(--ink-3)">成绩：${fmtScore(a.score)} / ${fmtScore(a.total_score)} 分</span>`;
      return;
    }
    if (a && a.status === "in_progress") {
      action.innerHTML = `<a class="btn" href="exam.html">继续答题</a>
        <span style="font-size:13px;color:var(--ink-3)">已开始，倒计时未结束前可继续</span>`;
      return;
    }
    if (!ctx.registration) {
      action.innerHTML = `<button class="btn" disabled>请先完成报名</button>`;
      return;
    }
    action.innerHTML = open
      ? `<a class="btn" href="exam.html">进入答题</a><span style="font-size:13px;color:var(--ink-3)">提交后不可重复作答</span>`
      : `<button class="btn ghost" disabled>尚未开放</button><span style="font-size:13px;color:var(--ink-3)">请在开放时间内进入</span>`;
  }

  function fmtScore(v) {
    const n = Number(v || 0);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  async function renderResult() {
    const a = ctx.attempt;
    const box = document.getElementById("resultBox");
    if (!a) {
      box.innerHTML = `<div class="empty-state" style="padding:26px"><h2>暂无答题记录</h2><p>答题入口开放后，请在规定时间内完成作答。</p></div>`;
      return;
    }
    if (a.status !== "submitted") {
      box.innerHTML = `<div class="notice warn">答题已开始但尚未提交，请进入答题页完成作答。</div>`;
      return;
    }
    document.getElementById("resultHint").textContent = "已提交 " + API.fmtTime(a.submitted_at);

    let rank = "—";
    try {
      const { count } = await API.sb
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted")
        .gt("score", a.score);
      if (typeof count === "number") rank = "第 " + (count + 1) + " 名";
    } catch (e) { /* 排名失败不影响主流程 */ }

    box.innerHTML = `
      <div class="result-hero">
        <div class="score">${fmtScore(a.score)}<small> / ${fmtScore(a.total_score)} 分</small></div>
        <div class="meta">正确 ${a.correct_count || 0} / ${a.question_count || 0} 题 · 用时 ${Math.round((a.duration_seconds || 0) / 60)} 分 ${(a.duration_seconds || 0) % 60} 秒 · ${rank}</div>
        <div class="verdict">${a.total_score > 0 && a.score / a.total_score >= 0.6 ? "成绩合格，感谢参与" : "成绩未达 60%，继续加油"}</div>
      </div>`;
  }
})();
