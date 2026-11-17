/* 数据看板 */
(function () {
  Admin.register("overview", { load });

  async function load() {
    const [regRes, attRes, qRes] = await Promise.all([
      API.sb.from("registrations").select("department"),
      API.sb.from("attempts").select("score,total_score,correct_count,question_count,status,detail"),
      API.sb.from("questions").select("id,qtype,content,is_active")
    ]);
    const regs = regRes.data || [];
    const atts = (attRes.data || []).filter((a) => a.status === "submitted");
    const qs = qRes.data || [];

    const avg = atts.length ? (atts.reduce((s, a) => s + Number(a.score || 0), 0) / atts.length).toFixed(1) : "0";
    const cards = [
      { label: "报名人数", value: regs.length, sub: "已提交报名" },
      { label: "已交卷", value: atts.length, sub: "正式答卷" },
      { label: "平均分", value: avg, sub: atts.length ? "分" : "暂无成绩" },
      { label: "题库题目", value: qs.length, sub: `启用 ${qs.filter((q) => q.is_active).length} 题` }
    ];
    document.getElementById("statCards").innerHTML = cards.map((c) => `
      <div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div><div class="stat-sub">${c.sub}</div></div>`).join("");

    // 系部分布
    const deptMap = {};
    regs.forEach((r) => { const k = r.department || "未填写"; deptMap[k] = (deptMap[k] || 0) + 1; });
    renderBars("deptBars", deptMap);

    // 状态分布
    const stateMap = { "已交卷": atts.length, "答题中": (attRes.data || []).filter((a) => a.status === "in_progress").length, "未参赛": Math.max(0, regs.length - atts.length) };
    renderBars("stateBars", stateMap);

    // 各题正确率
    const stat = {};
    atts.forEach((a) => (a.detail || []).forEach((d) => {
      if (!stat[d.id]) stat[d.id] = { total: 0, correct: 0 };
      stat[d.id].total++; if (d.is_correct) stat[d.id].correct++;
    }));
    const rows = qs.map((q) => {
      const s = stat[q.id];
      return { q, rate: s ? Math.round((s.correct / s.total) * 100) : null, n: s ? s.total : 0 };
    }).filter((x) => x.n > 0).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).slice(0, 30);
    const box = document.getElementById("accBars");
    if (!rows.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">暂无答题数据</div>'; return; }
    box.innerHTML = rows.map((x) => `
      <div class="chart-row">
        <div class="chart-label">${API.escapeHtml(x.q.content.slice(0, 34))}${x.q.content.length > 34 ? "…" : ""}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${x.rate}%"></div></div>
        <div class="chart-num">${x.rate}%（${x.n} 人）</div>
      </div>`).join("");
  }

  function renderBars(elId, map) {
    const box = document.getElementById(elId);
    const entries = Object.entries(map).filter(([, v]) => v > 0);
    if (!entries.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">暂无数据</div>'; return; }
    const max = Math.max(...entries.map(([, v]) => v));
    box.innerHTML = entries.map(([k, v]) => `
      <div class="chart-row">
        <div class="chart-label">${API.escapeHtml(k)}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${Math.round((v / max) * 100)}%"></div></div>
        <div class="chart-num">${v}</div>
      </div>`).join("");
  }
})();
