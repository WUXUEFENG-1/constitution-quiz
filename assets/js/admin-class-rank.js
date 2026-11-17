/* 班级排行：按班级参与率与百分制均分核算综合分，支持导出 CSV */
(function () {
  const W_AVG = 0.6;   // 均分权重
  const W_RATE = 0.4;  // 参与率权重
  let rows = [];

  Admin.register("classrank", { load });

  async function load() {
    document.getElementById("classRankRefresh").onclick = load;
    document.getElementById("classRankExport").onclick = exportCSV;

    const [profRes, attRes] = await Promise.all([
      API.sb.from("profiles").select("id,full_name,student_no,department,class_name,role,status"),
      API.sb.from("attempts").select("user_id,score,total_score,status,duration_seconds,submitted_at")
    ]);
    const regs = (profRes.data || []).filter((p) => p.role === "contestant" && p.status !== "banned");
    const atts = attRes.data || [];

    // 一人一份最佳成绩（分高者优先，同分取最新交卷）
    const best = new Map();
    atts.filter((a) => a.status === "submitted").forEach((a) => {
      const cur = best.get(a.user_id);
      if (!cur || (a.score || 0) > (cur.score || 0) ||
          ((a.score || 0) === (cur.score || 0) && (a.submitted_at || "") > (cur.submitted_at || ""))) {
        best.set(a.user_id, a);
      }
    });

    // 花名册基线
    const roster = {};
    (window.CLASS_ROSTER || []).forEach(([dept, name, total]) => {
      roster[name] = { dept, total, reg: 0, sub: 0, scoreSum: 0, pctSum: 0 };
    });

    // 报名人数归集
    regs.forEach((p) => {
      const cls = normalizeClass(p.class_name);
      if (!roster[cls]) roster[cls] = { dept: p.department, total: 0, reg: 0, sub: 0, scoreSum: 0, pctSum: 0, extra: true };
      roster[cls].reg += 1;
    });

    // 交卷成绩归集
    regs.forEach((p) => {
      const att = best.get(p.id);
      if (!att) return;
      const cls = normalizeClass(p.class_name);
      const e = roster[cls];
      e.sub += 1;
      e.scoreSum += Number(att.score || 0);
      const pct = att.total_score > 0 ? (Number(att.score || 0) / att.total_score) * 100 : 0;
      e.pctSum += pct;
    });

    // 汇总指标
    rows = Object.entries(roster).map(([cls, e]) => {
      const total = e.extra ? Math.max(e.reg, e.sub) : e.total;
      const rate = total > 0 ? e.sub / total : 0;
      const avgPct = e.sub > 0 ? e.pctSum / e.sub : 0;
      const avgRaw = e.sub > 0 ? e.scoreSum / e.sub : 0;
      const score = e.sub > 0 ? avgPct * W_AVG + rate * 100 * W_RATE : 0;
      return {
        cls, dept: normalizeDept(e.dept), total, reg: e.reg, sub: e.sub,
        rate, avgPct, avgRaw, score, extra: !!e.extra
      };
    }).filter((r) => r.total > 0 || r.reg > 0 || r.sub > 0)
      .sort((a, b) => b.score - a.score || b.rate - a.rate || b.avgPct - a.avgPct);

    render();
  }

  function render() {
    const body = document.getElementById("classRankBody");
    const count = document.getElementById("classRankCount");
    if (count) count.textContent = `共 ${rows.length} 个班级`;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center">暂无班级数据</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r, i) => {
      const rate = Math.round(r.rate * 100);
      const avg = r.sub > 0 ? r.avgPct.toFixed(1) : "—";
      return `<tr>
        <td><b>${i + 1}</b></td>
        <td>${API.escapeHtml(r.dept || "—")}</td>
        <td>${API.escapeHtml(r.cls)}${r.extra ? ' <span class="badge gray" style="margin-left:4px">未入花名册</span>' : ""}</td>
        <td>${r.total}</td>
        <td>${r.reg}</td>
        <td>${r.sub}</td>
        <td>${rate}%</td>
        <td>${avg}</td>
        <td><b>${r.score.toFixed(1)}</b></td>
      </tr>`;
    }).join("");
  }

  function exportCSV() {
    if (!rows.length) return API.toast("暂无可导出的班级排行数据", "error");
    const header = ["排名", "系部", "班级", "应到人数", "报名人数", "交卷人数", "参与率", "均分(百分制)", "原始均分", "综合分"];
    const lines = rows.map((r, i) => [
      i + 1, r.dept || "", r.cls, r.total, r.reg, r.sub,
      Math.round(r.rate * 100) + "%",
      r.sub > 0 ? r.avgPct.toFixed(1) : "",
      r.sub > 0 ? r.avgRaw.toFixed(1) : "",
      r.score.toFixed(1)
    ]);
    API.downloadCSV(`班级排行_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines]);
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
})();
