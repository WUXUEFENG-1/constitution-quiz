/* 正式答题 */
(function () {
  let questions = [];
  let answers = {};
  let attemptId = null;
  let remaining = 0;
  let tickTimer = null;
  let submitting = false;
  let storeKey = "";

  init();

  async function init() {
    try {
      const { profile } = await API.guard("contestant");
      document.getElementById("examMeta").textContent =
        `${profile.full_name || "选手"} · 学号 ${profile.student_no || "—"}`;
    } catch (e) { return; }

    document.getElementById("exitBtn").onclick = () => {
      if (confirm("答题尚未提交，确定退出？已作答内容会保留，可从答题入口继续。")) {
        location.href = "dashboard.html";
      }
    };
    document.getElementById("topSubmit").onclick = doSubmit;
    document.getElementById("submitBtn").onclick = doSubmit;

    await start();
  }

  function guardMessage(msg, retry) {
    document.getElementById("guardBox").innerHTML = `
      <div class="card" style="max-width:560px;margin:30px auto;text-align:center">
        <div class="empty-state" style="padding:24px 10px">
          <h2>暂时无法进入答题</h2>
          <p style="color:var(--red)">${API.escapeHtml(msg)}</p>
        </div>
        <div class="btn-row" style="justify-content:center">
          <a class="btn ghost" href="dashboard.html">返回选手中心</a>
          ${retry ? '<button class="btn" id="retryBtn">重新进入</button>' : ""}
        </div>
      </div>`;
    const r = document.getElementById("retryBtn");
    if (r) r.onclick = () => location.reload();
  }

  async function start() {
    document.getElementById("guardBox").innerHTML = `<div class="empty-state">正在获取试卷…</div>`;
    try {
      const { data, error } = await API.sb.rpc("start_exam");
      if (error) throw error;
      questions = data.questions || [];
      attemptId = data.attempt_id;
      remaining = Number(data.remaining_seconds || 0);
      storeKey = "exam_answers_" + attemptId;

      if (!questions.length) throw new Error("试卷为空，请联系管理员");

      document.getElementById("guardBox").innerHTML = "";
      document.getElementById("examArea").hidden = false;
      document.getElementById("examMeta").textContent += ` · 共 ${questions.length} 题 · ${data.duration_minutes} 分钟`;

      restoreAnswers();
      render();
      startTimer();
    } catch (err) {
      guardMessage(String(err.message || err), /结束|时间/.test(String(err.message || err)));
    }
  }

  function restoreAnswers() {
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") answers = saved;
    } catch (e) { /* 忽略损坏的本地缓存 */ }
  }

  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify(answers)); } catch (e) {}
  }

  function render() {
    const list = document.getElementById("qList");
    list.innerHTML = questions.map((q, i) => `
      <div class="q-item ${isAnswered(q.id) ? "is-answered" : ""}" id="q-${q.id}" data-id="${q.id}">
        <div class="q-head">
          <span class="q-index">${i + 1}</span>
          <div class="q-text"><span class="badge tag">${API.typeLabel(q.qtype)}</span>${API.escapeHtml(q.content)}</div>
          <span class="q-score">${q.score} 分</span>
        </div>
        <div class="q-body">${bodyHtml(q)}</div>
      </div>`).join("");

    applySavedState();
    bindEvents();
    updateProgress();
    renderSheet();
  }

  function bodyHtml(q) {
    if (q.qtype === "fill") {
      const n = Math.max(1, (q.options && q.options.length) || (q.answer && q.answer.length) || 1);
      return `<div class="fill-input">${Array.from({ length: n })
        .map((_, k) => `<input type="text" data-fill="${k}" placeholder="第 ${k + 1} 空">`)
        .join("")}</div>`;
    }
    const opts = q.qtype === "judge" ? ["正确", "错误"] : (q.options || []);
    const inputType = q.qtype === "multiple" ? "checkbox" : "radio";
    return `<div class="opt-list">${opts.map((text, k) => `
      <label class="opt">
        <input type="${inputType}" name="q-${q.id}" value="${API.letters[k]}" data-opt="${API.letters[k]}">
        <span><b>${API.letters[k]}.</b> ${API.escapeHtml(text)}</span>
      </label>`).join("")}</div>`;
  }

  function applySavedState() {
    document.querySelectorAll(".q-item").forEach((item) => {
      const v = answers[item.dataset.id];
      if (!v) return;
      item.querySelectorAll("input[data-opt]").forEach((el) => {
        if (Array.isArray(v) && v.includes(el.dataset.opt)) {
          el.checked = true;
          el.closest(".opt").classList.add("checked");
        }
      });
      if (Array.isArray(v)) {
        item.querySelectorAll("input[data-fill]").forEach((el, k) => {
          el.value = v[k] || "";
        });
      }
    });
  }

  function bindEvents() {
    document.querySelectorAll(".q-item").forEach((item) => {
      item.querySelectorAll("input[data-opt]").forEach((el) => {
        el.addEventListener("change", () => {
          const id = item.dataset.id;
          answers[id] = [...item.querySelectorAll("input[data-opt]:checked")].map((x) => x.dataset.opt);
          item.querySelectorAll(".opt").forEach((o) =>
            o.classList.toggle("checked", !!o.querySelector("input:checked")));
          item.classList.toggle("is-answered", answers[id].length > 0);
          persist(); updateProgress(); renderSheet();
        });
      });
      item.querySelectorAll("input[data-fill]").forEach((el) => {
        el.addEventListener("input", () => {
          const id = item.dataset.id;
          const vals = [...item.querySelectorAll("input[data-fill]")].map((x) => x.value);
          answers[id] = vals;
          item.classList.toggle("is-answered", vals.some((v) => v.trim() !== ""));
          persist(); updateProgress(); renderSheet();
        });
      });
    });
  }

  function isAnswered(id) {
    const v = answers[id];
    if (!v) return false;
    return Array.isArray(v) ? v.some((x) => String(x).trim() !== "") : String(v).trim() !== "";
  }

  function answeredCount() { return questions.filter((q) => isAnswered(q.id)).length; }

  function updateProgress() {
    document.getElementById("progressText").textContent = `已作答 ${answeredCount()} / ${questions.length}`;
  }

  function renderSheet() {
    document.getElementById("sheet").innerHTML = questions.map((q, i) =>
      `<button class="sheet-cell ${isAnswered(q.id) ? "done" : ""}" data-jump="${q.id}">${i + 1}</button>`
    ).join("");
    document.querySelectorAll("[data-jump]").forEach((b) => {
      b.onclick = () => document.getElementById("q-" + b.dataset.jump)
        .scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function startTimer() {
    const el = document.getElementById("timer");
    const render1 = () => {
      el.textContent = API.fmtSeconds(remaining);
      el.classList.toggle("urgent", remaining <= 300);
    };
    render1();
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(tickTimer);
        render1();
        API.toast("答题时间到，正在自动交卷…", "error", 3000);
        doSubmit(true);
        return;
      }
      render1();
    }, 1000);
  }

  async function doSubmit(auto) {
    if (submitting) return;
    const answered = answeredCount();
    if (!auto) {
      const unanswered = questions.length - answered;
      const tip = unanswered > 0 ? `还有 ${unanswered} 题未作答，` : "";
      if (!confirm(`${tip}确定提交答卷？提交后不可修改。`)) return;
    }
    submitting = true;
    document.getElementById("topSubmit").disabled = true;
    document.getElementById("submitBtn").disabled = true;
    document.getElementById("submitBtn").textContent = "提交中…";
    clearInterval(tickTimer);

    const payload = {};
    questions.forEach((q) => {
      const v = answers[q.id];
      if (!v) return;
      if (Array.isArray(v)) {
        const clean = v.map((x) => String(x).trim()).filter((x) => x !== "");
        if (clean.length) payload[q.id] = clean;
      } else if (String(v).trim() !== "") {
        payload[q.id] = q.qtype === "fill" ? [String(v).trim()] : String(v).trim();
      }
    });

    try {
      const { data, error } = await API.sb.rpc("submit_exam", { p_answers: payload });
      if (error) throw error;
      try { localStorage.removeItem(storeKey); } catch (e) {}
      showResult(data);
    } catch (err) {
      submitting = false;
      document.getElementById("submitBtn").disabled = false;
      document.getElementById("submitBtn").textContent = "提交答卷";
      document.getElementById("topSubmit").disabled = false;
      API.toast("提交失败：" + (err.message || err), "error", 4000);
      if (remaining > 0) startTimer();
    }
  }

  function showResult(r) {
    clearInterval(tickTimer);
    const pct = r.total_score > 0 ? Math.round((r.score / r.total_score) * 100) : 0;
    const reviewHtml = (r.detail || []).map((d, i) => `
      <div class="q-item" style="border-color:${d.is_correct ? "#c8ead9" : "#f3ccd3"}">
        <div class="q-head">
          <span class="q-index" style="background:${d.is_correct ? "#e5f5ee" : "#fdecef"};color:${d.is_correct ? "var(--green)" : "var(--red)"};">${i + 1}</span>
          <div class="q-text"><span class="badge tag">${API.typeLabel(d.qtype)}</span>${API.escapeHtml(d.content)}</div>
          <span class="q-score">${d.is_correct ? "✓ 得 " + d.score + " 分" : "✗ 0 分"}</span>
        </div>
        <div style="font-size:13.5px;color:var(--ink-2);padding-left:36px">
          <div>你的答案：<b style="color:${d.is_correct ? "var(--green)" : "var(--red)"}">${API.answerText(d.qtype, d.user_answer)}</b>　
          正确答案：<b style="color:var(--green)">${API.answerText(d.qtype, d.correct_answer)}</b></div>
          ${d.analysis ? `<div style="margin-top:6px;color:var(--ink-3)">解析：${API.escapeHtml(d.analysis)}</div>` : ""}
        </div>
      </div>`).join("");

    document.getElementById("examMain").innerHTML = `
      <div class="result-hero">
        <div style="font-size:13.5px;opacity:.85">本次答题成绩</div>
        <div class="score">${r.score}<small> / ${r.total_score} 分</small></div>
        <div class="meta">正确 ${r.correct_count} / ${r.question_count} 题 · 用时 ${Math.floor((r.duration_seconds || 0) / 60)} 分 ${(r.duration_seconds || 0) % 60} 秒</div>
        <div class="verdict">正确率 ${pct}%　${pct >= 60 ? "成绩已提交，等待组委会公布评奖结果" : "成绩已提交，建议继续练习巩固"}</div>
        <div style="margin-top:18px" class="btn-row">
          <a class="btn ghost" href="dashboard.html" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)">返回选手中心</a>
          <a class="btn ghost" href="practice.html?count=20" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)">去练习</a>
        </div>
      </div>
      <h3 class="page-title" style="margin-top:26px;font-size:18px">答卷回顾</h3>
      <p class="page-sub">以下为逐题判分结果与解析，可用于赛后复盘。</p>
      <div class="q-list">${reviewHtml}</div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.addEventListener("beforeunload", (e) => {
    if (!submitting && attemptId && questions.length) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });
})();
