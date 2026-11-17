/* 后台排行榜：复用 get_leaderboard RPC，按总分/用时排序展示 */
(function () {
  Admin.register("rank", { load });

  async function load() {
    const box = document.getElementById("adminRankList");
    const count = document.getElementById("rankCount");
    const refresh = document.getElementById("rankRefresh");
    if (refresh) refresh.onclick = load;

    const { data, error } = await API.sb.rpc("get_leaderboard");
    if (error) {
      box.innerHTML = `<div class="empty-state">加载失败：${API.escapeHtml(error.message)}</div>`;
      return;
    }
    const list = data || [];
    if (count) count.textContent = `共 ${list.length} 人`;
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><h2>暂无成绩</h2><p>赛事开赛后，交卷成绩将在此排名。</p></div>';
      return;
    }
    box.innerHTML = list.map((r, i) => {
      const pct = r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0;
      const cls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      const dur = Math.floor((r.duration_seconds || 0) / 60) + "分" + ((r.duration_seconds || 0) % 60) + "秒";
      return `<div class="rank-row">
        <div class="rank-no ${cls}">${i + 1}</div>
        <div class="rank-main">
          <div class="nm">${API.escapeHtml(r.full_name || "选手")}</div>
          <div class="sub">${API.escapeHtml(r.department || "")} · ${API.escapeHtml(r.class_name || "")} · 正确率 ${pct}% · 用时 ${dur}</div>
        </div>
        <div class="rank-score">${r.score}<small style="font-weight:400;color:var(--ink-3)"> / ${r.total_score}</small></div>
      </div>`;
    }).join("");
  }
})();
