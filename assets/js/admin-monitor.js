/* 监考监控 + 防作弊记录 */
(function () {
  let monitorTimer = null;

  Admin.register("monitor", { load: loadMonitor });
  Admin.register("cheat", { load: loadCheat });

  async function loadMonitor() {
    document.getElementById("monRefresh").onclick = loadMonitor;
    clearInterval(monitorTimer);
    monitorTimer = setInterval(() => { if (!document.getElementById("panel-monitor").hidden) loadMonitor(); }, 20000);
    const [{ data: atts }, { data: cheats }] = await Promise.all([
      API.sb.from("attempts").select("*").order("started_at", { ascending: false }),
      API.sb.from("cheat_events").select("user_id,kind,count")
    ]);
    // 过滤孤儿答卷（赛事编号为空）与工作人员账号，只统计参赛选手
    const allAtts = atts || [];
    const attMap = await API.profileMap(allAtts.map((a) => a.user_id));
    allAtts.forEach((a) => { a.profiles = attMap[a.user_id] || {}; });
    const rows = allAtts.filter((a) => a.competition_id && !API.isStaff((a.profiles || {}).role));
    const cheatMap = await API.profileMap((cheats || []).map((c) => c.user_id));
    const switchMap = {};
    (cheats || []).forEach((c) => {
      if (!c.user_id) return;
      if (API.isStaff((cheatMap[c.user_id] || {}).role)) return;
      if (!switchMap[c.user_id]) switchMap[c.user_id] = 0;
      if (["switch", "blur", "fullscreen", "resize", "focus_lost"].includes(c.kind)) switchMap[c.user_id] += (c.count || 1);
    });
    document.getElementById("monCount").textContent = `共 ${rows.length} 条答卷记录`;
    const body = document.getElementById("monBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">暂无答题记录</td></tr>'; return; }
    const now = Date.now();
    body.innerHTML = rows.map((a) => {
      const p = a.profiles || {};
      const answered = a.answers ? Object.keys(a.answers).length : 0;
      const elapsed = a.started_at ? Math.floor((now - new Date(a.started_at).getTime()) / 1000) : 0;
      const sw = switchMap[a.user_id] || 0;
      const status = a.status === "submitted"
        ? '<span class="badge green">已交卷</span>'
        : '<span class="badge amber">答题中</span>';
      const swCell = sw > 0
        ? `<span class="badge ${sw >= 3 ? "red" : "amber"}">${sw} 次</span>`
        : '<span class="muted">0</span>';
      return `<tr>
        <td>${API.escapeHtml(p.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(p.student_no || "—")}</td>
        <td>${API.escapeHtml(p.department || "—")} · ${API.escapeHtml(p.class_name || "—")}</td>
        <td>${status}</td>
        <td>${answered} / ${a.question_count || "—"}</td>
        <td>${swCell}</td>
        <td>${API.fmtSeconds(elapsed)}</td>
        <td>${API.fmtTime(a.started_at)}</td>
      </tr>`;
    }).join("");
  }

  const KIND = { switch: "切屏", blur: "窗口失焦", fullscreen: "退出全屏", resize: "窗口缩放", copy: "复制题目", focus_lost: "失去焦点", violation: "违规标记" };

  async function loadCheat() {
    const { data } = await API.sb.from("cheat_events")
      .select("*")
      .order("created_at", { ascending: false }).limit(200);
    const all = data || [];
    const pMap = await API.profileMap(all.map((c) => c.user_id));
    all.forEach((c) => { c.profiles = pMap[c.user_id] || {}; });
    // 工作人员账号不计入异常记录，只展示参赛选手
    const rows = all.filter((c) => !API.isStaff((c.profiles || {}).role));
    document.getElementById("cheatCount").textContent = `共 ${rows.length} 条记录`;
    const body = document.getElementById("cheatBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center">暂无异常行为记录</td></tr>'; return; }
    body.innerHTML = rows.map((c) => {
      const p = c.profiles || {};
      return `<tr>
        <td>${API.escapeHtml(p.full_name || "—")}<div class="muted mono" style="font-size:12px">${API.escapeHtml(p.student_no || "")}</div></td>
        <td><span class="badge red">${KIND[c.kind] || c.kind}</span></td>
        <td>${API.escapeHtml(c.detail)}</td>
        <td>${c.count}</td>
        <td>${API.fmtTime(c.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="link-btn danger" data-ban="${c.user_id}">封禁账号</button>
          <button class="link-btn" data-del="${c.id}">删除</button>
        </td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-ban]").forEach((b) => b.onclick = async () => {
      if (!await API.confirm("确认封禁该账号？")) return;
      const { error } = await API.sb.rpc("admin_set_status", { p_id: b.dataset.ban, p_status: "banned", p_reason: "答题异常行为" });
      if (error) return API.toast("操作失败：" + error.message, "error");
      API.toast("已封禁", "success"); loadCheat();
    });
    body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!await API.confirm("确认删除这条异常行为记录？")) return;
      const { error } = await API.sb.rpc("admin_delete_cheat", { p_id: b.dataset.del });
      if (error) return API.toast("删除失败：" + error.message, "error");
      API.toast("已删除", "success"); loadCheat();
    });
  }
})();
