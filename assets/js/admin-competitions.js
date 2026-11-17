/* 竞赛与试卷管理：创建 / 编辑 / 状态 / 组卷配置 */
(function () {
  let list = [];
  const STATUS = { draft: ["草稿", "gray"], open: ["进行中", "green"], closed: ["已关闭", "amber"], finished: ["已结束", "blue"] };

  Admin.register("competitions", { load });

  async function load() {
    const { data } = await API.sb.from("competitions").select("*").order("created_at", { ascending: false });
    list = data || [];
    document.getElementById("compRefresh").onclick = load;
    document.getElementById("compAddBtn").onclick = () => openEdit(null);
    render();
  }

  function render() {
    const box = document.getElementById("compList");
    if (!list.length) { box.innerHTML = '<div class="empty-state" style="padding:30px">尚未创建竞赛，点击右上角“创建竞赛”。</div>'; return; }
    box.innerHTML = list.map((c) => {
      const [t, color] = STATUS[c.status] || [c.status, "gray"];
      return `<div class="comp-card">
        <div class="comp-head">
          <div>
            <div class="comp-title">${API.escapeHtml(c.title)} <span class="badge ${color}">${t}</span></div>
            <div class="comp-sub">${API.escapeHtml(c.subtitle || "")}</div>
          </div>
          <div class="op">
            <button class="link-btn" data-act="edit" data-id="${c.id}">编辑</button>
            <button class="link-btn" data-act="open" data-id="${c.id}">${c.status === "open" ? "关闭入口" : "开放答题"}</button>
            <button class="link-btn" data-act="finish" data-id="${c.id}">结束赛事</button>
            <button class="link-btn danger" data-act="del" data-id="${c.id}">删除</button>
          </div>
        </div>
        <div class="kv">
          <span>开始：${API.fmtTime(c.start_at)}</span>
          <span>结束：${API.fmtTime(c.end_at)}</span>
          <span>时长：${c.duration_minutes} 分钟</span>
          <span>题量：${c.question_count} 题</span>
          <span>组卷：${c.paper_type === "fixed" ? "固定组卷" : "随机抽题"}</span>
          <span>申诉：${c.appeal_enabled === false ? "关闭" : "开启"}</span>
          <span>切屏上限：${c.switch_limit || 3} 次</span>
        </div>
        ${c.rules ? `<div class="comp-rules">竞赛规则：${API.renderRules(c.rules)}</div>` : ""}
        ${c.note ? `<div class="comp-note">备注：${API.escapeHtml(c.note)}</div>` : ""}
      </div>`;
    }).join("");
    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => onAction(b.dataset.act, b.dataset.id));
  }

  function find(id) { return list.find((c) => c.id === id); }

  function onAction(act, id) {
    const c = find(id); if (!c) return;
    if (act === "edit") return openEdit(c);
    if (act === "open") return toggleOpen(c);
    if (act === "finish") return finish(c);
    if (act === "del") return del(c);
  }

  async function toggleOpen(c) {
    const next = c.status === "open" ? "closed" : "open";
    if (next === "open") {
      const { data: others } = await API.sb.from("competitions").select("id").neq("id", c.id).eq("status", "open");
      if ((others || []).length) {
        if (!await API.confirm("已有其他赛事处于开放状态，开放本场将自动关闭其他赛事，是否继续？")) return;
        await API.sb.from("competitions").update({ status: "closed" }).eq("status", "open");
      }
    }
    await API.sb.from("competitions").update({ status: next, updated_at: new Date().toISOString() }).eq("id", c.id);
    API.toast(next === "open" ? "答题入口已开放" : "答题入口已关闭", "success");
    API.logAction("赛事状态变更", `${c.title} -> ${next}`);
    load();
  }

  async function finish(c) {
    if (!await API.confirm(`确认结束赛事「${c.title}」？`)) return;
    await API.sb.from("competitions").update({ status: "finished", updated_at: new Date().toISOString() }).eq("id", c.id);
    API.toast("赛事已结束", "success"); load();
  }

  async function del(c) {
    if (!await API.confirm(`确认删除赛事「${c.title}」？关联答卷不会删除。`)) return;
    await API.sb.from("competitions").delete().eq("id", c.id);
    API.toast("已删除", "success"); load();
  }

  function openEdit(c) {
    const f = c || { title: "", subtitle: "", rules: "", start_at: "", end_at: "", duration_minutes: 30, question_count: 40, shuffle: true, paper_type: "random", appeal_enabled: true, switch_limit: 3, note: "" };
    const body = `
      <div class="field"><label>赛事标题 <span class="req">*</span></label><input id="fTitle" value="${API.escapeHtml(f.title)}"></div>
      <div class="field"><label>副标题</label><input id="fSub" value="${API.escapeHtml(f.subtitle)}"></div>
      <div class="grid-2">
        <div class="field"><label>开始时间</label><input type="datetime-local" id="fStart" value="${API.toLocalInput(f.start_at)}"></div>
        <div class="field"><label>结束时间</label><input type="datetime-local" id="fEnd" value="${API.toLocalInput(f.end_at)}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>答题时长（分钟）</label><input type="number" id="fDur" min="1" value="${f.duration_minutes}"></div>
        <div class="field"><label>题量</label><input type="number" id="fCount" min="1" value="${f.question_count}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>组卷方式</label><select id="fPaper">
          <option value="random" ${f.paper_type !== "fixed" ? "selected" : ""}>随机抽题组卷</option>
          <option value="fixed" ${f.paper_type === "fixed" ? "selected" : ""}>固定组卷（按题库顺序）</option>
        </select></div>
        <div class="field"><label>切屏次数上限</label><input type="number" id="fSwitch" min="1" max="20" value="${f.switch_limit || 3}"></div>
      </div>
      <div class="field"><label><input type="checkbox" id="fShuffle" ${f.shuffle ? "checked" : ""}> 随机打乱题目 / 选项顺序</label></div>
      <div class="field"><label><input type="checkbox" id="fAppeal" ${f.appeal_enabled !== false ? "checked" : ""}> 开启赛后申诉</label></div>
      <div class="field"><label>竞赛规则</label><textarea id="fRules" rows="3">${API.escapeHtml(f.rules)}</textarea></div>
      <div class="field"><label>备注</label><input id="fNote" value="${API.escapeHtml(f.note)}"></div>`;
    Admin.openModal(c ? "编辑赛事" : "创建竞赛", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("保存", "", () => save(c))
    ]);
  }

  async function save(c) {
    const title = document.getElementById("fTitle").value.trim();
    if (!title) return API.toast("标题必填", "error");
    const payload = {
      title,
      subtitle: document.getElementById("fSub").value.trim(),
      start_at: API.localToISO(document.getElementById("fStart").value),
      end_at: API.localToISO(document.getElementById("fEnd").value),
      duration_minutes: Number(document.getElementById("fDur").value) || 30,
      question_count: Number(document.getElementById("fCount").value) || 40,
      shuffle: document.getElementById("fShuffle").checked,
      paper_type: document.getElementById("fPaper").value,
      appeal_enabled: document.getElementById("fAppeal").checked,
      switch_limit: Number(document.getElementById("fSwitch").value) || 3,
      rules: document.getElementById("fRules").value.trim(),
      note: document.getElementById("fNote").value.trim(),
      updated_at: new Date().toISOString()
    };
    if (c) {
      const { error } = await API.sb.from("competitions").update(payload).eq("id", c.id);
      if (error) return API.toast("保存失败：" + error.message, "error");
    } else {
      const { error } = await API.sb.from("competitions").insert({ ...payload, status: "draft" });
      if (error) return API.toast("创建失败：" + error.message, "error");
    }
    API.toast("赛事已保存", "success"); Admin.closeModal(); load();
  }
})();
