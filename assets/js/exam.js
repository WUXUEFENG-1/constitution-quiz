/* 正式答题 v2：答题卡、草稿暂存、倒计时、切屏检测、提交后跳转成绩页 */
(function () {
  let questions = [], answers = {}, attemptId = null, remaining = 0;
  let tickTimer = null, submitting = false, storeKey = "";
  let switchCount = 0;

  init();

  async function init() {
    try {
      const { profile } = await API.guard("contestant");
      document.getElementById("examMeta").textContent =
        `${profile.full_name || "选手"} · 学号 ${profile.student_no || "—"}`;
    } catch (e) { return; }

    await API.loadSettings();
    document.getElementById("exitBtn").onclick = () => {
      if (confirm("答题尚未提交，确定退出？已作答内容会保留，可从答题入口继续。")) location.href = "home.html";
    };
    document.getElementById("topSubmit").onclick = doSubmit;
    document.getElementById("submitBtn").onclick = doSubmit;
    document.getElementById("draftBtn").onclick = toggleBoard;
    document.getElementById("cheatOk").onclick = () => document.getElementById("cheatModal").hidden = true;

    bindCheat();
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
          <a class="btn ghost" href="home.html">返回选手中心</a>
          ${retry ? '<button class="btn" id="retryBtn">重新进入</button>' : ""}
        </div>
      </div>`;
    const r = document.getElementById("retryBtn");
    if (r) r.onclick = () => location.reload();
  }

  async function start() {
    document.getElementById("guardBox").innerHTML = `<div class="empty-state">正在获取试卷…</div>`;
    try {
      const { data, error } = await API.sb.rpc("start_exam_v2");
      if (error) throw error;
      questions = data.questions || [];
      attemptId = data.attempt_id;
      remaining = Number(data.remaining_seconds || 0);
      storeKey = "exam_answers_" + attemptId;

      if (!questions.length) throw new Error("试卷为空，请联系管理员");

      document.getElementById("guardBox").innerHTML = "";
      document.getElementById("examArea").hidden = false;
      if (data.competition_title) document.getElementById("examTitle").textContent = data.competition_title;
      document.getElementById("examMeta").textContent += ` · 共 ${questions.length} 题 · ${data.duration_minutes} 分钟`;

      restoreAnswers();
      render();
      startTimer();
    } catch (err) {
      const msg = String(err.message || err);
      guardMessage(msg, /结束|时间/.test(msg));
    }
  }

  function restoreAnswers() {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) { const saved = JSON.parse(raw); if (saved && typeof saved === "object") answers = saved; }
    } catch (e) {}
  }
  function persist() { try { localStorage.setItem(storeKey, JSON.stringify(answers)); } catch (e) {} }

  function render() {
    document.getElementById("qList").innerHTML = questions.map((q, i) => `
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
      const n = Math.max(1, (q.options && q.options.length) || 1);
      return `<div class="fill-input">${Array.from({ length: n })
        .map((_, k) => `<input type="text" data-fill="${k}" placeholder="第 ${k + 1} 空">`).join("")}</div>`;
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
          el.checked = true; el.closest(".opt").classList.add("checked");
        }
      });
      if (Array.isArray(v)) item.querySelectorAll("input[data-fill]").forEach((el, k) => { el.value = v[k] || ""; });
    });
  }

  function bindEvents() {
    document.querySelectorAll(".q-item").forEach((item) => {
      item.querySelectorAll("input[data-opt]").forEach((el) => {
        el.addEventListener("change", () => {
          const id = item.dataset.id;
          answers[id] = [...item.querySelectorAll("input[data-opt]:checked")].map((x) => x.dataset.opt);
          item.querySelectorAll(".opt").forEach((o) => o.classList.toggle("checked", !!o.querySelector("input:checked")));
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
  function updateProgress() { document.getElementById("progressText").textContent = `已作答 ${answeredCount()} / ${questions.length}`; }

  function renderSheet() {
    document.getElementById("sheet").innerHTML = questions.map((q, i) =>
      `<button class="sheet-cell ${isAnswered(q.id) ? "done" : ""}" data-jump="${q.id}">${i + 1}</button>`).join("");
    document.querySelectorAll("[data-jump]").forEach((b) => {
      b.onclick = () => document.getElementById("q-" + b.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
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
        clearInterval(tickTimer); render1();
        API.toast("答题时间到，正在自动交卷…", "error", 3000);
        doSubmit(true); return;
      }
      render1();
    }, 1000);
  }

  /* 防作弊：切屏 / 失焦 / 复制记录并提醒 */
  function bindCheat() {
    const sec = API.getSetting("security", {});
    const maxSwitch = Number(sec.max_switch || 3);
    const report = (kind, detail) => {
      if (submitting) return;
      switchCount++;
      API.recordCheat(kind, `${detail}（第 ${switchCount} 次）`);
      if (switchCount > maxSwitch) {
        document.getElementById("cheatText").textContent = `检测到第 ${switchCount} 次异常切换，已标记为违规行为。`;
      } else {
        document.getElementById("cheatText").textContent = "检测到您离开答题页面，本次行为已被记录。";
      }
      document.getElementById("cheatModal").hidden = false;
    };
    document.addEventListener("visibilitychange", () => { if (document.hidden) report("switch", "页面切到后台"); });
    window.addEventListener("blur", () => report("blur", "窗口失焦"));
    document.addEventListener("copy", () => report("copy", "复制题目内容"));
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
      const { data, error } = await API.sb.rpc("submit_exam_v2", { p_answers: payload });
      if (error) throw error;
      try { localStorage.removeItem(storeKey); } catch (e) {}
      location.replace("result.html?id=" + (data.attempt_id || ""));
    } catch (err) {
      submitting = false;
      document.getElementById("submitBtn").disabled = false;
      document.getElementById("submitBtn").textContent = "提交答卷";
      document.getElementById("topSubmit").disabled = false;
      API.toast("提交失败：" + (err.message || err), "error", 4000);
      if (remaining > 0) startTimer();
    }
  }

  let boardOpen = false;
  function toggleBoard() {
    boardOpen = !boardOpen;
    let board = document.getElementById("draftBoard");
    if (!board) {
      board = document.createElement("div");
      board.id = "draftBoard"; board.className = "draft-board";
      board.innerHTML = `<div class="db-head"><span>草稿板</span><button class="link-btn" id="dbClose">收起</button></div>
        <textarea id="dbText" placeholder="记录思路、关键词…自动保存在本机"></textarea>`;
      document.body.appendChild(board);
      const ta = document.getElementById("dbText");
      ta.value = localStorage.getItem("xfjs_draft") || "";
      ta.oninput = () => localStorage.setItem("xfjs_draft", ta.value);
      document.getElementById("dbClose").onclick = toggleBoard;
    }
    board.style.display = boardOpen ? "" : "none";
  }

  window.addEventListener("beforeunload", (e) => {
    if (!submitting && attemptId && questions.length) { e.preventDefault(); e.returnValue = ""; return ""; }
  });
})();
