/* 在线练习：按题型固定组卷（单选50×1 / 多选20×1.5 / 判断10×1 / 填空5×2），多选部分选对得1分 */
(function () {
  const PLAN = [
    { qtype: "single",  n: 50, score: 1 },
    { qtype: "multiple", n: 20, full: 1.5, partial: 1, score: 1.5 },
    { qtype: "judge",   n: 10, score: 1 },
    { qtype: "fill",    n: 5,  score: 2 }
  ];

  let questions = [];
  let answers = {};
  let graded = false;
  let profile = null;

  init();

  async function init() {
    try {
      const ctx = await API.guard(null);
      profile = ctx.profile;
      document.getElementById("userChip").textContent = profile.full_name || "选手";
    } catch (e) { return; }

    document.getElementById("logoutBtn").onclick = () => API.signOut();
    document.getElementById("reloadBtn").onclick = () => {
      graded = false;
      answers = {};
      load();
    };
    document.getElementById("submitBtn").onclick = gradeAll;

    load();
  }

  async function load() {
    const list = document.getElementById("qList");
    list.innerHTML = `<div class="empty-state">正在抽题…</div>`;
    try {
      const batches = await Promise.all(PLAN.map(async (plan) => {
        const { data, error } = await API.sb.rpc("get_practice_questions", {
          p_count: plan.n,
          p_type: plan.qtype
        });
        if (error) throw error;
        return (data || []).map((q) => ({ ...q, _plan: plan }));
      }));
      questions = batches.flat();
    } catch (err) {
      list.innerHTML = `<div class="notice danger">抽题失败：${API.escapeHtml(err.message || err)}</div>`;
      return;
    }

    if (!questions.length) {
      list.innerHTML = `<div class="empty-state"><h2>题库暂无可用题目</h2><p>请联系管理员导入题库后再练习。</p></div>`;
      return;
    }

    document.getElementById("practiceTip").textContent =
      `· 本次 ${questions.length} 题（单选 / 多选 / 判断 / 填空 自动组卷）`;
    document.getElementById("submitBtn").disabled = false;
    render();
  }

  function render() {
    const list = document.getElementById("qList");
    list.innerHTML = questions.map((q, i) => qHtml(q, i)).join("");
    bindEvents();
    updateProgress();
    renderSheet();
  }

  function qHtml(q, i) {
    const tag = `<span class="badge tag">${API.typeLabel(q.qtype)}</span>`;
    return `
      <div class="q-item" id="q-${q.id}" data-id="${q.id}">
        <div class="q-head">
          <span class="q-index">${i + 1}</span>
          <div class="q-text">${tag}${API.escapeHtml(q.content)}</div>
        </div>
        <div class="q-body">${bodyHtml(q)}</div>
        <div class="q-result" id="res-${q.id}" hidden></div>
      </div>`;
  }

  function bodyHtml(q) {
    if (q.qtype === "fill") {
      const blanks = (q.content.match(/_{2,}/g) || []).length;
      const n = Math.max(1, blanks || (q.options && q.options.length) || 1);
      return `<div class="fill-input">${Array.from({ length: n })
        .map((_, k) => `<input type="text" data-fill="${k}" placeholder="第 ${k + 1} 空">`)
        .join("")}</div>`;
    }
    const opts = (q.options && q.options.length) ? q.options : (q.qtype === "judge" ? ["正确", "错误"] : []);
    const inputType = q.qtype === "multiple" ? "checkbox" : "radio";
    return `<div class="opt-list">${opts.map((text, k) => `
      <label class="opt">
        <input type="${inputType}" name="q-${q.id}" value="${API.letters[k]}" data-opt="${API.letters[k]}">
        <span><b>${API.letters[k]}.</b> ${API.escapeHtml(text)}</span>
      </label>`).join("")}</div>`;
  }

  function bindEvents() {
    document.querySelectorAll(".q-item").forEach((item) => {
      item.querySelectorAll("input[data-opt]").forEach((el) => {
        el.addEventListener("change", () => {
          if (graded) return;
          const id = item.dataset.id;
          const checked = [...item.querySelectorAll("input[data-opt]:checked")].map((x) => x.dataset.opt);
          answers[id] = checked;
          item.querySelectorAll(".opt").forEach((o) => {
            o.classList.toggle("checked", !!o.querySelector("input:checked"));
          });
          item.classList.toggle("is-answered", checked.length > 0);
          updateProgress();
          renderSheet();
        });
      });
      item.querySelectorAll("input[data-fill]").forEach((el) => {
        el.addEventListener("input", () => {
          if (graded) return;
          const id = item.dataset.id;
          const inputs = [...item.querySelectorAll("input[data-fill]")];
          answers[id] = inputs.map((x) => x.value);
          const filled = answers[id].some((v) => String(v).trim() !== "");
          item.classList.toggle("is-answered", filled);
          updateProgress();
          renderSheet();
        });
      });
    });
  }

  function answeredCount() {
    return questions.filter((q) => {
      const v = answers[q.id];
      if (!v) return false;
      return Array.isArray(v) ? v.some((x) => String(x).trim() !== "") : String(v).trim() !== "";
    }).length;
  }

  function updateProgress() {
    document.getElementById("progressText").textContent = `已作答 ${answeredCount()} / ${questions.length}`;
  }

  function renderSheet() {
    document.getElementById("sheet").innerHTML = questions
      .map((q, i) => {
        const v = answers[q.id];
        const done = Array.isArray(v) ? v.some((x) => String(x).trim() !== "") : !!v;
        return `<button class="sheet-cell ${done ? "done" : ""}" data-jump="${q.id}">${i + 1}</button>`;
      })
      .join("");
    document.querySelectorAll("[data-jump]").forEach((b) => {
      b.onclick = () => document.getElementById("q-" + b.dataset.jump)
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function norm(t) {
    return String(t == null ? "" : t).replace(/[\s\u3000]+/g, "").toLowerCase();
  }

  function isCorrect(q, userAnswer) {
    const correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(norm);
    const mine = (Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map(norm).filter(Boolean);
    if (!mine.length) return false;
    if (q.qtype === "fill") return mine.every((m) => correct.includes(m));
    if (mine.length !== correct.length) return false;
    return [...correct].sort().join("|") === [...mine].sort().join("|");
  }

  /* 计分：单选/判断/填空 全对得分；多选 全对1.5、部分选对1、有错0 */
  function scoreFor(q, userAnswer) {
    const plan = q._plan || {};
    const correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(norm);
    const mine = (Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map(norm).filter(Boolean);
    if (!mine.length) return 0;
    if (q.qtype === "multiple") {
      const hasWrong = mine.some((m) => !correct.includes(m));
      if (hasWrong) return 0;
      if (mine.length === correct.length) return plan.full || 1.5;
      return plan.partial || 1;
    }
    return isCorrect(q, userAnswer) ? (plan.score || Number(q.score || 0)) : 0;
  }

  function gradeAll() {
    if (graded) return;
    if (answeredCount() === 0) { API.toast("请至少作答一题", "error"); return; }

    graded = true;
    let right = 0, totalScore = 0, myScore = 0;

    questions.forEach((q) => {
      const mine = answers[q.id];
      const ok = isCorrect(q, mine);
      if (ok) right++;
      const got = scoreFor(q, mine);
      myScore += got;
      totalScore += (q._plan && q._plan.score) || Number(q.score || 0);

      const res = document.getElementById("res-" + q.id);
      res.hidden = false;
      res.innerHTML = `
        <div class="notice ${ok ? "ok" : "danger"}" style="margin-top:12px">
          <strong>${ok ? "回答正确" : "回答错误"}</strong>
          　你的答案：${API.answerText(q.qtype, mine && mine.some((x) => String(x).trim() !== "") ? mine : [], q.options)}
          　正确答案：${API.answerText(q.qtype, q.answer, q.options)}
          ${q.analysis ? `<div style="margin-top:6px;color:var(--ink-2);font-weight:400">解析：${API.escapeHtml(q.analysis)}</div>` : ""}
        </div>`;
    });

    document.querySelectorAll(".q-item").forEach((item) => {
      item.querySelectorAll("input").forEach((i) => (i.disabled = true));
    });
    document.getElementById("submitBtn").disabled = true;
    API.toast(`练习完成：答对 ${right} / ${questions.length} 题，得分 ${myScore} / ${totalScore}`, "success", 4000);

    savePracticeHistory({
      title: "在线练习",
      score: Math.round(myScore * 100) / 100,
      total_score: Math.round(totalScore * 100) / 100,
      correct_count: right,
      question_count: questions.length,
      duration_seconds: 0,
      submitted_at: new Date().toISOString()
    });

    const summary = document.createElement("div");
    summary.className = "card";
    summary.innerHTML = `<div class="card-title">本组练习结果</div>
      <div class="grid-3">
        <div class="stat"><div class="k">答对题数</div><div class="v">${right}<small>/ ${questions.length}</small></div></div>
        <div class="stat"><div class="k">本组得分</div><div class="v">${myScore}<small>/ ${totalScore}</small></div></div>
        <div class="stat"><div class="k">正确率</div><div class="v">${Math.round((right / questions.length) * 100)}<small>%</small></div></div>
      </div>`;
    document.getElementById("qList").prepend(summary);
    summary.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function savePracticeHistory(row) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem("xfjs_practice_history") || "[]"); } catch (e) {}
    hist.unshift(row);
    localStorage.setItem("xfjs_practice_history", JSON.stringify(hist.slice(0, 50)));

    // 同步落库，供后台“练习排行”统计（仅练习，不计入正式竞赛成绩）
    if (!profile || !profile.id) return;
    const rate = row.question_count ? Math.round((row.correct_count / row.question_count) * 10000) / 100 : 0;
    API.sb.from("practice_records").insert({
      user_id: profile.id,
      full_name: profile.full_name || "",
      student_no: profile.student_no || "",
      department: profile.department || "",
      class_name: profile.class_name || "",
      score: row.score,
      total_score: row.total_score,
      correct_count: row.correct_count,
      question_count: row.question_count,
      correct_rate: rate,
      duration_seconds: row.duration_seconds || 0,
      created_at: row.submitted_at
    }).then(({ error }) => { if (error) console.warn("练习记录保存失败：", error.message); });
  }
})();
