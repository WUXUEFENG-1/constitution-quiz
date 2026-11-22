/* 正式答题 v3：答题卡（已答/未答/标记）、标记本题、上一题/下一题、草稿暂存、倒计时、切屏检测、二次确认交卷 */
(function () {
  let questions = [], answers = {}, marks = {}, attemptId = null, remaining = 0;
  let tickTimer = null, submitting = false, storeKey = "";
  let switchCount = 0, current = 0, timeoutWarned = false, compSwitchLimit = null;
  let lastCheatAt = 0, cloudAnswers = {}, cloudSaveTimer = null;
  let compTitle = "", durationMin = 0, examStarted = false;

  init();

  async function init() {
    try {
      const { profile } = await API.guard("contestant");
      document.getElementById("examMeta").textContent =
        `${profile.full_name || "选手"} · 学号 ${profile.student_no || "—"}`;
    } catch (e) { return; }

    await API.loadSettings();
    document.getElementById("exitBtn").onclick = async () => {
      if (await API.confirm("答题尚未提交，确定退出？已作答内容会保留，可从答题入口继续。")) {
        exitFullscreen();
        location.href = "home.html";
      }
    };
    document.getElementById("topSubmit").onclick = requestSubmit;
    document.getElementById("submitBtn").onclick = requestSubmit;
    document.getElementById("draftBtn").onclick = toggleBoard;
    document.getElementById("cheatOk").onclick = () => document.getElementById("cheatModal").hidden = true;

    document.getElementById("markBtn").onclick = toggleMark;
    document.getElementById("prevBtn").onclick = () => jump(current - 1);
    document.getElementById("nextBtn").onclick = () => jump(current + 1);
    document.getElementById("submitCancel").onclick = () => { document.getElementById("submitModal").hidden = true; };
    document.getElementById("submitConfirm").onclick = () => { document.getElementById("submitModal").hidden = true; confirmSubmit(false); };
    document.getElementById("timeoutOk").onclick = () => { document.getElementById("timeoutModal").hidden = true; };

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

  function requestFullscreenEl(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return Promise.resolve(false);
    try {
      const r = fn.call(el);
      return Promise.resolve(r && r.catch ? r.catch(() => false) : true);
    } catch (e) { return Promise.resolve(false); }
  }

  function enterFullscreen() {
    return requestFullscreenEl(document.documentElement);
  }

  function exitFullscreen() {
    const doc = document;
    const fn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (doc.fullscreenElement && fn) {
      try { const r = fn.call(doc); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    }
  }

  async function start() {
    document.getElementById("guardBox").innerHTML = `<div class="empty-state">正在获取试卷…</div>`;
    try {
      const { data, error } = await API.sb.rpc("start_exam_v2");
      if (error) throw error;
      questions = data.questions || [];
      attemptId = data.attempt_id;
      remaining = Number(data.remaining_seconds || 0);
      compSwitchLimit = data.switch_limit != null ? Number(data.switch_limit) : null;
      storeKey = "exam_answers_" + attemptId;
      cloudAnswers = data.answers || {};

      if (!questions.length) throw new Error("试卷为空，请联系管理员");

      compTitle = data.competition_title || "";
      durationMin = data.duration_minutes || 0;

      // 浏览器全屏 API 必须由用户点击触发，先弹全屏引导框，点击按钮后再进入全屏并开考
      document.getElementById("fsStartBtn").onclick = beginExam;
      document.getElementById("fsModal").hidden = false;
    } catch (err) {
      const msg = String(err.message || err);
      guardMessage(msg, /结束|时间/.test(msg));
    }
  }

  async function beginExam() {
    if (examStarted) return;
    examStarted = true;

    // 在点击手势内同步发起全屏申请；手势上下文内调用才不会被浏览器拒绝
    const entered = await enterFullscreen();

    document.getElementById("fsModal").hidden = true;
    document.getElementById("guardBox").innerHTML = "";
    document.getElementById("examArea").hidden = false;

    if (!entered) API.toast("当前浏览器未允许进入全屏，仍可继续答题", "error", 3000);

    if (compTitle) document.getElementById("examTitle").textContent = compTitle;
    document.getElementById("examMeta").textContent += ` · 共 ${questions.length} 题 · ${durationMin} 分钟`;

    restoreAnswers();
    render();
    startTimer();
    scheduleCloudSave(15000);
  }

  function restoreAnswers() {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          answers = saved.answers || {};
          marks = saved.marks || {};
        }
      }
    } catch (e) {}
    // 云端草稿补齐本机缺失的作答（换设备 / 清缓存后续答）
    Object.keys(cloudAnswers || {}).forEach((qid) => {
      if (answers[qid] == null) answers[qid] = cloudAnswers[qid];
    });
  }
  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify({ answers, marks })); } catch (e) {}
    scheduleCloudSave(3000);
  }
  /* 云端草稿节流保存：delay 内合并为一次；startTimer 期间每 15 秒兜底同步 */
  function scheduleCloudSave(delay) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => { API.saveProgress(answers); }, delay || 3000);
  }

  function render() {
    document.getElementById("qList").innerHTML = questions.map((q, i) => `
      <div class="q-item ${isAnswered(q.id) ? "is-answered" : ""} ${marks[q.id] ? "is-marked" : ""}" id="q-${q.id}" data-id="${q.id}">
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
      const blanks = (q.content.match(/_{2,}/g) || []).length;
      const n = Math.max(1, blanks || (q.options && q.options.length) || 1);
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
      item.addEventListener("click", () => { current = questions.findIndex((q) => q.id === item.dataset.id); updateMarkBtn(); });
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
    document.getElementById("sheet").innerHTML = questions.map((q, i) => {
      const cls = ["sheet-cell"];
      if (marks[q.id]) cls.push("marked");
      if (isAnswered(q.id)) cls.push("done"); else cls.push("todo");
      return `<button class="${cls.join(" ")}" data-jump="${q.id}">${i + 1}</button>`;
    }).join("");
    document.querySelectorAll("[data-jump]").forEach((b) => {
      b.onclick = () => {
        current = questions.findIndex((q) => q.id === b.dataset.jump);
        jump(current);
      };
    });
  }

  function jump(i) {
    if (!questions.length) return;
    current = Math.max(0, Math.min(questions.length - 1, i));
    const item = document.getElementById("q-" + questions[current].id);
    if (item) item.scrollIntoView({ behavior: "smooth", block: "start" });
    updateMarkBtn();
  }

  function toggleMark() {
    const q = questions[current];
    if (!q) return;
    marks[q.id] = !marks[q.id];
    if (!marks[q.id]) delete marks[q.id];
    const item = document.getElementById("q-" + q.id);
    if (item) item.classList.toggle("is-marked", !!marks[q.id]);
    persist(); renderSheet(); updateMarkBtn();
  }

  function updateMarkBtn() {
    const q = questions[current];
    const btn = document.getElementById("markBtn");
    if (!q || !btn) return;
    const on = !!marks[q.id];
    btn.textContent = on ? "★ 已标记" : "☆ 标记本题";
    btn.style.color = on ? "#fff" : "";
    btn.style.background = on ? "var(--amber)" : "";
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
      if (remaining === 60 && !timeoutWarned) {
        timeoutWarned = true;
        document.getElementById("timeoutText").textContent = "答题时间仅剩 1 分钟，请尽快完成作答并交卷。";
        document.getElementById("timeoutModal").hidden = false;
      }
      if (remaining <= 0) {
        clearInterval(tickTimer); render1();
        API.toast("答题时间到，正在自动交卷…", "error", 3000);
        confirmSubmit(true); return;
      }
      render1();
    }, 1000);
  }

  /* 防作弊：切后台 / 失焦 / 退出全屏 / 缩放窗口 计入切屏次数；复制单独记录。
     第 1、2 次警告，达到上限提示将强制收卷，超过上限自动交卷。 */
  function bindCheat() {
    const sec = API.getSetting("security", {});
    const maxSwitch = Number(compSwitchLimit || sec.max_switch || 3);
    const SWITCH_KINDS = new Set(["switch", "blur", "fullscreen", "resize"]);

    const report = (kind, detail) => {
      if (submitting) return;
      const now = Date.now();
      if (now - lastCheatAt < 1500) return; // 一次离开动作常并发触发多个事件，合并去抖
      lastCheatAt = now;

      if (!SWITCH_KINDS.has(kind)) {
        // 复制等异常行为单独记录，不占用切屏次数
        API.recordCheat(kind, detail);
        return;
      }

      switchCount++;
      API.recordCheat(kind, `${detail}（第 ${switchCount} 次）`);

      if (switchCount > maxSwitch) {
        API.toast("切屏次数已超限，系统强制收卷", "error", 3000);
        confirmSubmit(true);
        return;
      }

      const text = switchCount >= maxSwitch
        ? `你已切屏 ${switchCount} 次，系统将强制收卷。`
        : `你已切屏 ${switchCount} 次，请尽快回到答题页面。`;
      document.getElementById("cheatText").textContent = text;
      document.getElementById("cheatModal").hidden = false;
    };

    document.addEventListener("visibilitychange", () => { if (document.hidden) report("switch", "页面切到后台"); });
    window.addEventListener("blur", () => report("blur", "窗口失焦"));
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && !submitting) report("fullscreen", "退出全屏");
    });
    window.addEventListener("resize", () => report("resize", "窗口尺寸被缩放"));
    document.addEventListener("copy", () => report("copy", "复制题目内容"));
  }

  function requestSubmit() {
    if (submitting) return;
    const unanswered = questions.length - answeredCount();
    document.getElementById("submitTip").textContent = unanswered > 0
      ? `还有 ${unanswered} 题未作答，确定提交答卷？提交后不可修改。`
      : "已全部作答，确认提交当前答卷？提交后不可修改。";
    document.getElementById("submitModal").hidden = false;
  }

  async function confirmSubmit(auto) {
    if (submitting) return;
    submitting = true;
    document.getElementById("topSubmit").disabled = true;
    document.getElementById("submitBtn").disabled = true;
    document.getElementById("submitBtn").textContent = "提交中…";
    clearInterval(tickTimer);
    clearTimeout(cloudSaveTimer);

    await API.saveProgress(answers);

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
      exitFullscreen();
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
