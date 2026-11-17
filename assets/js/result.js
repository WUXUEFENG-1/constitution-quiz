/* 赛后页：得分展示、错题回看、答案解析、申诉入口 */
(function () {
  let attempt = null;

  init();

  async function init() {
    let profile;
    try { const ctx = await API.guard("contestant"); profile = ctx.profile; } catch (e) { return; }
    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();

    const qs = new URLSearchParams(location.search);
    const id = qs.get("id");
    let query = API.sb.from("attempts").select("*").eq("user_id", (await API.currentUser()).id);
    if (id) query = query.eq("id", id);
    const { data, error } = await query.order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (error) return renderError(error.message);
    if (!data) return renderError("暂无答卷记录");
    attempt = data;
    render();
  }

  function renderError(msg) {
    document.getElementById("resultMain").innerHTML = `
      <div class="empty-state"><h2>暂无成绩</h2><p>${API.escapeHtml(msg)}</p>
      <div class="btn-row" style="justify-content:center;margin-top:16px">
      <a class="btn" href="home.html">返回选手中心</a></div></div>`;
  }

  function render() {
    const r = attempt;
    const pct = r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0;
    const detail = r.detail || [];
    const reviewHtml = detail.map((d, i) => `
      <div class="q-item" style="border-color:${d.is_correct ? "#c8ead9" : "#f3ccd3"}">
        <div class="q-head">
          <span class="q-index" style="background:${d.is_correct ? "#e5f5ee" : "#fdecef"};color:${d.is_correct ? "var(--green)" : "var(--red)"}">${i + 1}</span>
          <div class="q-text"><span class="badge tag">${API.typeLabel(d.qtype)}</span>${API.escapeHtml(d.content)}</div>
          <span class="q-score">${d.is_correct ? "✓ 得 " + d.score + " 分" : "✗ 0 分"}</span>
        </div>
        <div style="font-size:13.5px;color:var(--ink-2);padding-left:36px">
          <div>你的答案：<b style="color:${d.is_correct ? "var(--green)" : "var(--red)"}">${API.answerText(d.qtype, d.user_answer)}</b>　
          正确答案：<b style="color:var(--green)">${API.answerText(d.qtype, d.correct_answer)}</b></div>
          ${d.analysis ? `<div style="margin-top:6px;color:var(--ink-3)">解析：${API.escapeHtml(d.analysis)}</div>` : ""}
          ${!d.is_correct ? `<div style="margin-top:8px"><a class="link-btn" href="appeals.html?attempt=${r.id}&qid=${d.id}&kind=question">对本题提出异议申诉</a></div>` : ""}
        </div>
      </div>`).join("");

    document.getElementById("resultMain").innerHTML = `
      <div class="result-hero">
        <div style="font-size:13.5px;opacity:.85">本次答题成绩</div>
        <div class="score">${r.score}<small> / ${r.total_score} 分</small></div>
        <div class="meta">正确 ${r.correct_count} / ${r.question_count} 题 · 用时 ${Math.floor((r.duration_seconds || 0) / 60)} 分 ${(r.duration_seconds || 0) % 60} 秒${r.rank_no ? ` · 排名第 ${r.rank_no} 名` : ""} · ${API.fmtTime(r.submitted_at)}</div>
        <div class="verdict">正确率 ${pct}%　${pct >= 60 ? "成绩已提交，等待组委会公布评奖结果" : "建议继续练习巩固"}</div>
        <div style="margin-top:18px" class="btn-row">
          <a class="btn ghost" href="home.html" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)">返回选手中心</a>
          <a class="btn ghost" href="practice.html?count=20" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)">去练习</a>
          <a class="btn ghost" href="appeals.html?attempt=${r.id}&kind=score" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)">分数异议申诉</a>
        </div>
      </div>
      <h3 class="page-title" style="margin-top:26px;font-size:18px">答卷回顾</h3>
      <p class="page-sub">逐题判分结果与解析，可用于赛后复盘。</p>
      <div class="q-list">${reviewHtml}</div>`;
    window.scrollTo({ top: 0 });
  }
})();
