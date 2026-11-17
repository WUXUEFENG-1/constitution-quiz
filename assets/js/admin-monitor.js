/* 监考监控 + 防作弊记录 */
(function () {
  let monitorTimer = null;

  Admin.register("monitor", { load: loadMonitor });
  Admin.register("cheat", { load: loadCheat });

  async function loadMonitor() {
    document.getElementById("monRefresh").onclick = loadMonitor;
    clearInterval(monitorTimer);
    monitorTimer = setInterval(() => { if (!document.getElementById("panel-monitor").hidden) loadMonitor(); }, 20000);
    const { data } = await API.sb.from("attempts")
      .select("*,profiles(full_name,student_no,department,class_name)")
      .order("started_at", { ascending: false });
    const rows = data || [];
    document.getElementById("monCount").textContent = `共 ${rows.length} 条答卷记录`;
    const body = document.getElementById("monBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center">暂无答题记录</td></tr>'; return; }
    const now = Date.now();
    body.innerHTML = rows.map((a) => {
      const p = a.profiles || {};
      const answered = a.answers ? Object.keys(a.answers).length : 0;
      const elapsed = a.started_at ? Math.floor((now - new Date(a.started_at).getTime()) / 1000) : 0;
      const status = a.status === "submitted"
        ? '<span class="badge green">已交卷</span>'
        : '<span class="badge amber">答题中</span>';
      return `<tr>
        <td>${API.escapeHtml(p.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(p.student_no || "—")}</td>
        <td>${API.escapeHtml(p.department || "—")} · ${API.escapeHtml(p.class_name || "—")}</td>
        <td>${status}</td>
        <td>${answered} / ${a.question_count || "—"}</td>
        <td>${API.fmtSeconds(elapsed)}</td>
        <td>${API.fmtTime(a.started_at)}</td>
      </tr>`;
    }).join("");
  }

  const KIND = { switch: "切屏", blur: "窗口失焦", copy: "复制题目", focus_lost: "失去焦点", violation: "违规标记" };

  async function loadCheat() {
    const { data } = await API.sb.from("cheat_events")
      .select("*,profiles(full_name,student_no)")
      .order("created_at", { ascending: false }).limit(200);
    const rows = data || [];
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
        <td><button class="link-btn danger" data-ban="${c.user_id}">封禁账号</button></td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-ban]").forEach((b) => b.onclick = async () => {
      if (!confirm("确认封禁该账号？")) return;
      const { error } = await API.sb.rpc("admin_set_status", { p_user_id: b.dataset.ban, p_status: "banned", p_reason: "答题异常行为" });
      if (error) return API.toast("操作失败：" + error.message, "error");
      API.toast("已封禁", "success"); loadCheat();
    });
  }
})();
