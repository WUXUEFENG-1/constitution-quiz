/* 后台练习排行：聚合每位选手的在线练习次数、最高分、最近一次成绩与正确率 */
(function () {
  let lastList = [];

  Admin.register("practice", { load });

  async function load() {
    const body = document.getElementById("practiceBody");
    const count = document.getElementById("practiceCount");
    const refresh = document.getElementById("practiceRefresh");
    const exportBtn = document.getElementById("practiceExport");
    const search = document.getElementById("practiceSearch");
    if (refresh) refresh.onclick = load;
    if (exportBtn) exportBtn.onclick = exportCSV;
    if (search) search.oninput = render;

    const { data, error } = await API.sb.rpc("get_practice_leaderboard");
    if (error) {
      body.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center">加载失败：${API.escapeHtml(error.message)}</td></tr>`;
      return;
    }
    lastList = data || [];
    render();
  }

  function filtered() {
    const kw = (document.getElementById("practiceSearch")?.value || "").trim().toLowerCase();
    if (!kw) return lastList;
    return lastList.filter((r) =>
      [r.full_name, r.student_no, r.class_name, r.department]
        .map((x) => String(x || "").toLowerCase())
        .some((x) => x.includes(kw))
    );
  }

  function render() {
    const body = document.getElementById("practiceBody");
    const count = document.getElementById("practiceCount");
    const list = filtered();
    if (count) count.textContent = `共 ${list.length} 人`;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center">暂无练习记录</td></tr>';
      return;
    }
    body.innerHTML = list.map((r, i) => {
      const best = r.best_score ?? 0;
      const last = r.last_score ?? 0;
      const rate = r.last_rate ?? (r.last_question ? Math.round((r.last_correct / r.last_question) * 100) : 0);
      const cls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      return `<tr>
        <td class="rank-no ${cls}">${i + 1}</td>
        <td>${API.escapeHtml(r.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(r.student_no || "—")}</td>
        <td>${API.escapeHtml(r.department || "—")}</td>
        <td>${API.escapeHtml(r.class_name || "—")}</td>
        <td>${r.practice_count || 0}</td>
        <td><strong>${best}</strong><small style="font-weight:400;color:var(--ink-3)"> / ${r.best_total || 0}</small></td>
        <td>${last}<small style="font-weight:400;color:var(--ink-3)"> / ${r.last_total || 0}</small></td>
        <td>${Math.round(rate)}%</td>
        <td>${API.fmtTime(r.last_at)}</td>
      </tr>`;
    }).join("");
  }

  function exportCSV() {
    const list = filtered();
    if (!list.length) return API.toast("暂无可导出的练习数据", "error");
    const header = ["排名", "姓名", "学号", "系部", "班级", "练习次数", "最高分", "最高总分", "最近得分", "最近总分", "最近正确率(%)", "最近练习时间"];
    const lines = list.map((r, i) => {
      const rate = r.last_rate ?? (r.last_question ? Math.round((r.last_correct / r.last_question) * 100) : 0);
      return [
        i + 1,
        r.full_name || "",
        r.student_no || "",
        r.department || "",
        r.class_name || "",
        r.practice_count || 0,
        r.best_score ?? 0,
        r.best_total || 0,
        r.last_score ?? 0,
        r.last_total || 0,
        Math.round(rate),
        API.fmtTime(r.last_at)
      ];
    });
    API.downloadCSV(`在线练习排行_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines]);
  }
})();
