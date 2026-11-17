/* 试卷管理：按赛事展示试卷模板与题库题型配比（只读预览） */
(function () {
  let comps = [], qs = [];
  const STATUS = { draft: ["草稿", "gray"], open: ["进行中", "green"], closed: ["已关闭", "amber"], finished: ["已结束", "blue"] };
  const TYPES = ["single", "multiple", "judge", "fill"];

  Admin.register("papers", { load });

  async function load() {
    const [cRes, qRes] = await Promise.all([
      API.sb.from("competitions").select("*").order("created_at", { ascending: false }),
      API.sb.from("questions").select("qtype,is_active")
    ]);
    comps = cRes.data || [];
    qs = qRes.data || [];
    const btn = document.getElementById("paperRefresh");
    if (btn) btn.onclick = load;
    render();
  }

  function typeMix() {
    const active = qs.filter((q) => q.is_active !== false);
    const m = {};
    TYPES.forEach((t) => { m[t] = active.filter((q) => q.qtype === t).length; });
    return m;
  }

  function render() {
    const box = document.getElementById("paperList");
    if (!comps.length) {
      box.innerHTML = '<div class="empty-state" style="padding:30px">暂无试卷模板，请先在「竞赛管理」创建赛事，系统将按其组卷配置生成试卷。</div>';
      return;
    }
    const m = typeMix();
    box.innerHTML = comps.map((c) => {
      const [t, color] = STATUS[c.status] || [c.status, "gray"];
      const mixHtml = TYPES.map((tp) => `<span>${API.typeLabel(tp)} ${m[tp] || 0} 题</span>`).join("");
      return `<div class="comp-card">
        <div class="comp-head">
          <div>
            <div class="comp-title">${API.escapeHtml(c.title)} <span class="badge ${color}">${t}</span></div>
            <div class="comp-sub">${API.escapeHtml(c.subtitle || "试卷模板")}</div>
          </div>
        </div>
        <div class="kv">
          <span>组卷方式：${c.paper_type === "fixed" ? "固定组卷" : "随机抽题"}</span>
          <span>配置题量：${c.question_count} 题</span>
          <span>答题时长：${c.duration_minutes} 分钟</span>
          <span>题目/选项打乱：${c.shuffle ? "是" : "否"}</span>
          <span>赛后申诉：${c.appeal_enabled === false ? "关闭" : "开启"}</span>
          <span>切屏上限：${c.switch_limit || 3} 次</span>
        </div>
        <div class="comp-rules">题库可用题型配比：${mixHtml}</div>
      </div>`;
    }).join("");
  }
})();
