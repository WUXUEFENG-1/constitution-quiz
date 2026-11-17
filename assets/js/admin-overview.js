/* 数据看板 */
(function () {
  Admin.register("overview", { load });

  async function load() {
    const [profRes, attRes, qRes] = await Promise.all([
      API.sb.from("profiles").select("full_name,student_no,department,class_name,role,status"),
      API.sb.from("attempts").select("score,total_score,correct_count,question_count,status,detail,user_id"),
      API.sb.from("questions").select("id,qtype,content,is_active")
    ]);
    // 与“选手管理”同一数据源（profiles）：仅统计正常状态的选手账号，不含管理员/员工角色与封禁账号
    const regs = (profRes.data || []).filter((p) => p.role === "contestant" && p.status !== "banned");
    const atts = (attRes.data || []).filter((a) => a.status === "submitted");
    const qs = qRes.data || [];

    const submittedIds = new Set(atts.map((a) => a.user_id));
    const online = (attRes.data || []).filter((a) => a.status === "in_progress").length;
    const submittedCount = submittedIds.size;
    const avg = atts.length ? (atts.reduce((s, a) => s + Number(a.score || 0), 0) / atts.length).toFixed(1) : "0";
    const totalCorrect = atts.reduce((s, a) => s + Number(a.correct_count || 0), 0);
    const totalQ = atts.reduce((s, a) => s + Number(a.question_count || 0), 0);
    const accuracy = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
    const cards = [
      { label: "参赛总人数", value: regs.length, sub: "选手账号" },
      { label: "在线人数", value: online, sub: "正在答题" },
      { label: "平均分", value: avg, sub: atts.length ? "分" : "暂无成绩" },
      { label: "答题正确率", value: accuracy + "%", sub: `已交卷 ${submittedCount} 份` }
    ];
    document.getElementById("statCards").innerHTML = cards.map((c) => `
      <div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div><div class="stat-sub">${c.sub}</div></div>`).join("");

    // 系部分布（旧系名按关键词归并到标准学院，如“应用经济系/应用经济学”→ 应用经济学院）
    const deptMap = {};
    regs.forEach((r) => { const k = normalizeDept(r.department); deptMap[k] = (deptMap[k] || 0) + 1; });
    renderBars("deptBars", deptMap);

    // 班级分布（缺“班”字的按数字结尾自动补全，如“计算机网络技术2602”→“计算机网络技术2602班”）
    const classMap = {};
    regs.forEach((r) => { const k = normalizeClass(r.class_name); classMap[k] = (classMap[k] || 0) + 1; });
    renderBars("classBars", classMap);

    // 状态分布
    const stateMap = { "已交卷": submittedCount, "答题中": online, "未参赛": Math.max(0, regs.length - submittedCount) };
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

  function normalizeDept(name) {
    const d = String(name || "").trim();
    if (!d) return "未填写";
    if (/应用经济|经济/.test(d)) return "应用经济学院";
    if (/数控/.test(d)) return "数控加工学院";
    if (/电气/.test(d)) return "电气工程学院";
    if (/汽车/.test(d)) return "汽车工程学院";
    if (/机械|机器人/.test(d)) return "机械工程学院";
    if (/现代服务|服务/.test(d)) return "现代服务学院";
    return d;
  }

  function normalizeClass(name) {
    const d = String(name || "").trim().replace(/\s+/g, "");
    if (!d) return "未填写";
    if (/班$/.test(d)) return d;
    if (/\d{2,4}$/.test(d)) return d + "班";
    return d;
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
