/* 成绩管理：查询、导出、错题统计 */
(function () {
  let all = [];

  Admin.register("scores", { load });

  async function load() {
    const { data } = await API.sb.from("attempts")
      .select("*")
      .order("score", { ascending: false, nullsFirst: false });
    all = data || [];
    const pMap = await API.profileMap(all.map((a) => a.user_id));
    all.forEach((a) => { a.profiles = pMap[a.user_id] || {}; });
    document.getElementById("scoreRefresh").onclick = load;
    document.getElementById("scoreExport").onclick = exportCSV;
    ["scoreSearch", "scoreStatus"].forEach((id) => {
      const el = document.getElementById(id);
      el.oninput = render; el.onchange = render;
    });
    render();
  }

  function filtered() {
    const kw = document.getElementById("scoreSearch").value.trim().toLowerCase();
    const status = document.getElementById("scoreStatus").value;
    return all.filter((a) => {
      if (status && a.status !== status) return false;
      const p = a.profiles || {};
      if (kw && ![p.full_name, p.student_no, p.class_name].some((v) => String(v || "").toLowerCase().includes(kw))) return false;
      return true;
    });
  }

  function render() {
    const rows = filtered();
    const submitted = rows.filter((a) => a.status === "submitted");
    document.getElementById("scoreCount").textContent = `共 ${rows.length} 条（已交卷 ${submitted.length}）`;
    const body = document.getElementById("scoreBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="12" class="muted" style="text-align:center">暂无成绩</td></tr>'; return; }
    const rankMap = new Map();
    submitted.slice().sort((a, b) => b.score - a.score || (a.duration_seconds || 0) - (b.duration_seconds || 0))
      .forEach((a, i) => rankMap.set(a.id, i + 1));
    body.innerHTML = rows.map((a) => {
      const p = a.profiles || {};
      const pct = a.total_score > 0 ? Math.round((a.score / a.total_score) * 100) : 0;
      return `<tr>
        <td>${rankMap.has(a.id) ? "第 " + rankMap.get(a.id) + " 名" : "—"}</td>
        <td>${API.escapeHtml(p.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(p.student_no || "—")}</td>
        <td>${API.escapeHtml(p.department || "—")}</td>
        <td>${API.escapeHtml(p.class_name || "—")}</td>
        <td><b>${a.score ?? "—"}</b></td><td>${a.total_score ?? "—"}</td>
        <td>${a.correct_count ?? "—"}/${a.question_count ?? "—"}</td>
        <td>${pct}%</td>
        <td>${Math.floor((a.duration_seconds || 0) / 60)}分${(a.duration_seconds || 0) % 60}秒</td>
        <td>${API.fmtTime(a.submitted_at)}</td>
        <td><button class="link-btn danger" data-del="${a.id}">删除</button></td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => delAttempt(b.dataset.del));
  }

  async function delAttempt(id) {
    const a = all.find((x) => x.id === id);
    const name = a && a.profiles ? (a.profiles.full_name || a.profiles.student_no || "") : "";
    const ok = await API.confirm(`确认删除该成绩记录${name ? "（" + name + "）" : ""}？关联的异常行为、申诉记录会一并清除，账号保留。`);
    if (!ok) return;
    const { error } = await API.sb.rpc("admin_delete_attempt", { p_id: id });
    if (error) return API.toast("删除失败：" + error.message, "error", 4000);
    API.toast("成绩已删除", "success");
    load();
  }

  function exportCSV() {
    const rows = filtered().filter((a) => a.status === "submitted");
    if (!rows.length) return API.toast("暂无可导出的已交卷成绩", "error");
    const header = ["排名", "姓名", "学号", "系部", "班级", "得分", "总分", "正确题数", "正确率", "用时(秒)", "交卷时间"];
    const rankMap = new Map();
    rows.slice().sort((a, b) => b.score - a.score || (a.duration_seconds || 0) - (b.duration_seconds || 0))
      .forEach((a, i) => rankMap.set(a.id, i + 1));
    const lines = rows.map((a) => {
      const p = a.profiles || {};
      const pct = a.total_score > 0 ? Math.round((a.score / a.total_score) * 100) : 0;
      return [rankMap.get(a.id) || "", p.full_name || "", p.student_no || "", p.department || "", p.class_name || "",
        a.score, a.total_score, `${a.correct_count}/${a.question_count}`, pct + "%", a.duration_seconds || 0, API.fmtTime(a.submitted_at)];
    });
    API.downloadCSV(`竞赛成绩_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines]);
  }
})();
