/* 班级排行：按班级参与率与百分制均分核算综合分，支持筛选与导出 CSV */
(function () {
  const W_AVG = 0.6;   // 均分权重
  const W_RATE = 0.4;  // 参与率权重
  let allRows = [];
  let filtered = [];

  Admin.register("classrank", { load });

  /* 专业简写 → 花名册标准专业名（key 为可命中的简写关键词，越长越优先） */
  const MAJOR_ALIAS = [
    { standard: "计算机网络技术", keys: ["计算机网络", "网络技术", "网络", "计算机"] },
    { standard: "软件技术", keys: ["软件"] },
    { standard: "人工智能技术应用", keys: ["人工智能", "智能应用", "ai"] },
    { standard: "数控技术", keys: ["数控"] },
    { standard: "数字化设计与制造技术", keys: ["数字化设计", "设计与制造", "数字化", "数设", "数造"] },
    { standard: "机电一体化技术", keys: ["机电一体化", "机电", "一体化"] },
    { standard: "工业机器人技术", keys: ["工业机器人", "机器人"] },
    { standard: "电气自动化技术", keys: ["电气自动化", "电气"] },
    { standard: "工业互联网技术", keys: ["工业互联网", "互联网", "工互"] },
    { standard: "新能源汽车技术", keys: ["新能源汽车", "新能源车", "汽车"] },
    { standard: "新能源汽车检测与维修", keys: ["汽车检测", "检测与维修", "汽修", "汽检", "维修"] },
    { standard: "智能焊接技术", keys: ["智能焊接", "焊接"] },
    { standard: "机械制造及自动化", keys: ["机械制造", "机械", "机造"] },
    { standard: "烹饪工艺与营养", keys: ["烹饪工艺", "烹饪", "餐营", "营养"] }
  ];

  let rosterIndex = null;
  function buildIndex() {
    if (rosterIndex) return rosterIndex;
    rosterIndex = (window.CLASS_ROSTER || []).map(([dept, full, total]) => {
      const { major, num } = parseClass(full);
      return { dept, full, major, num, total };
    });
    return rosterIndex;
  }

  function parseClass(raw) {
    const t = String(raw || "").trim().replace(/\s+/g, "").replace(/班$/, "");
    const m = t.match(/(\d{2,4})/);
    if (!m) return { major: t, num: "" };
    return { major: t.slice(0, m.index), num: m[1] };
  }

  /* 选手填写的简写班级（如 计算机2501 / 计算机网络2501）归一到花名册标准班名 */
  function resolveClass(raw) {
    const idx = buildIndex();
    const clean = String(raw || "").trim().replace(/\s+/g, "");
    if (!clean) return "未填写";
    const exact = idx.find((r) => r.full === clean || r.full === clean + "班");
    if (exact) return exact.full;
    const { major, num } = parseClass(clean);
    if (!num) return normalizeClass(raw);
    const cands = idx.filter((r) => r.num === num);
    let hit = cands.find((r) => major && (r.major.includes(major) || major.includes(r.major)));
    if (!hit) {
      let bestLen = 0;
      cands.forEach((r) => {
        const g = MAJOR_ALIAS.find((a) => a.standard === r.major);
        if (!g) return;
        g.keys.forEach((k) => {
          if (major.toLowerCase().includes(k.toLowerCase()) && k.length > bestLen) {
            bestLen = k.length; hit = r;
          }
        });
      });
    }
    return hit ? hit.full : normalizeClass(raw);
  }

  async function load() {
    document.getElementById("classRankRefresh").onclick = load;
    document.getElementById("classRankExport").onclick = exportCSV;

    const searchEl = document.getElementById("classRankSearch");
    const deptEl = document.getElementById("classRankDept");
    const stateEl = document.getElementById("classRankState");
    [searchEl, deptEl, stateEl].forEach((el) => {
      el.oninput = applyFilterAndRender;
      el.onchange = applyFilterAndRender;
    });

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
      const cls = resolveClass(p.class_name);
      if (!roster[cls]) roster[cls] = { dept: p.department, total: 0, reg: 0, sub: 0, scoreSum: 0, pctSum: 0, extra: true };
      roster[cls].reg += 1;
    });

    // 交卷成绩归集
    regs.forEach((p) => {
      const att = best.get(p.id);
      if (!att) return;
      const cls = resolveClass(p.class_name);
      const e = roster[cls];
      e.sub += 1;
      e.scoreSum += Number(att.score || 0);
      const pct = att.total_score > 0 ? (Number(att.score || 0) / att.total_score) * 100 : 0;
      e.pctSum += pct;
    });

    // 汇总指标
    allRows = Object.entries(roster).map(([cls, e]) => {
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

    fillDeptOptions();
    applyFilter();
    render();
  }

  function stateOf(r) {
    if (r.sub > 0) return "submitted";
    if (r.reg > 0) return "registered";
    return "idle";
  }

  function fillDeptOptions() {
    const sel = document.getElementById("classRankDept");
    const cur = sel.value;
    const depts = [...new Set(allRows.map((r) => r.dept).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">全部系部</option>' +
      depts.map((d) => `<option value="${API.escapeHtml(d)}">${API.escapeHtml(d)}</option>`).join("");
    sel.value = depts.includes(cur) ? cur : "";
  }

  function applyFilter() {
    const kw = (document.getElementById("classRankSearch").value || "").trim().toLowerCase();
    const dept = document.getElementById("classRankDept").value;
    const st = document.getElementById("classRankState").value;
    filtered = allRows.filter((r) => {
      if (dept && r.dept !== dept) return false;
      if (st && stateOf(r) !== st) return false;
      if (kw && !r.cls.toLowerCase().includes(kw)) return false;
      return true;
    });
  }

  function applyFilterAndRender() {
    applyFilter();
    render();
  }

  function render() {
    const body = document.getElementById("classRankBody");
    const count = document.getElementById("classRankCount");
    const base = `共 ${allRows.length} 个班级`;
    if (count) count.textContent = filtered.length !== allRows.length ? `${base}（筛选 ${filtered.length}）` : base;
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center">暂无符合条件的班级</td></tr>';
      return;
    }
    body.innerHTML = filtered.map((r, i) => {
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
    if (!filtered.length) return API.toast("暂无可导出的班级排行数据", "error");
    const header = ["排名", "系部", "班级", "应到人数", "报名人数", "交卷人数", "参与率", "均分(百分制)", "原始均分", "综合分"];
    const lines = filtered.map((r, i) => [
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
