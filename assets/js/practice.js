/* 在线练习 */
(function () {
  const params = new URLSearchParams(location.search);
  const count = Math.max(1, Math.min(50, parseInt(params.get("count") || "10", 10)));
  const type = ["single", "multiple", "judge", "fill"].includes(params.get("type") || "") ? params.get("type") : "";

  let questions = [];
  let answers = {};
  let graded = false;

  init();

  async function init() {
    try {
      const { profile } = await API.guard(null);
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
      const { data, error } = await API.sb.rpc("get_practice_questions", { p_count: count, p_type: type });
      if (error) throw error;
      questions = Array.isArray(data) ? data : [];
    } catch (err) {
      list.innerHTML = `<div class="notice danger">抽题失败：${API.escapeHtml(err.message || err)}</div>`;
      return;
    }

    if (!questions.length) {
      list.innerHTML = `<div class="empty-state"><h2>题库暂无可用题目</h2><p>请联系管理员导入题库后再练习。</p></div>`;
      return;
    }

    document.getElementById("practiceTip").textContent =
      `· 本次 ${questions.length} 题${type ? "（" + API.typeLabel(type) + "）" : ""}`;
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
      const n = Math.max(1, (q.options && q.options.length) || (q.answer ? q.answer.length : 1));
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
    if (mine.length !== correct.length) return false;
    if (q.qtype === "fill") return correct.join("|") === mine.join("|");
    return [...correct].sort().join("|") === [...mine].sort().join("|");
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
      myScore += ok ? Number(q.score || 0) : 0;
      totalScore += Number(q.score || 0);

      const res = document.getElementById("res-" + q.id);
      res.hidden = false;
      res.innerHTML = `
        <div class="notice ${ok ? "ok" : "danger"}" style="margin-top:12px">
          <strong>${ok ? "回答正确" : "回答错误"}</strong>
          　你的答案：${API.answerText(q.qtype, mine && mine.some((x) => String(x).trim() !== "") ? mine : [])}
          　正确答案：${API.answerText(q.qtype, q.answer)}
          ${q.analysis ? `<div style="margin-top:6px;color:var(--ink-2);font-weight:400">解析：${API.escapeHtml(q.analysis)}</div>` : ""}
        </div>`;
    });

    document.querySelectorAll(".q-item").forEach((item) => {
      item.querySelectorAll("input").forEach((i) => (i.disabled = true));
    });
    document.getElementById("submitBtn").disabled = true;
    API.toast(`练习完成：答对 ${right} / ${questions.length} 题，得分 ${myScore} / ${totalScore}`, "success", 4000);

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
})();
