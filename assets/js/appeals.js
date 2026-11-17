/* 申诉提交与记录 */
(function () {
  let profile = null;
  const STATUS = { pending: ["待处理", "amber"], approved: ["已采纳", "green"], rejected: ["未采纳", "red"] };

  init();

  async function init() {
    try { const ctx = await API.guard("contestant"); profile = ctx.profile; } catch (e) { return; }
    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();

    const qs = new URLSearchParams(location.search);
    if (qs.get("kind")) document.getElementById("aKind").value = qs.get("kind");
    if (qs.get("attempt")) document.getElementById("aAttempt").value = qs.get("attempt");

    document.getElementById("appealForm").onsubmit = onSubmit;
    await loadList();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const kind = document.getElementById("aKind").value;
    const content = document.getElementById("aContent").value.trim();
    const attemptId = document.getElementById("aAttempt").value.trim() || null;
    const qid = new URLSearchParams(location.search).get("qid");
    if (content.length < 5) return API.toast("申诉内容至少 5 个字", "error");
    try {
      const { error } = await API.sb.rpc("submit_appeal", {
        p_kind: kind, p_content: content, p_qid: qid || null, p_attempt_id: attemptId
      });
      if (error) throw error;
      API.toast("申诉已提交，组委会将尽快审核", "success");
      document.getElementById("aContent").value = "";
      await loadList();
    } catch (err) {
      API.toast("提交失败：" + (err.message || err), "error", 3600);
    }
  }

  async function loadList() {
    const { data } = await API.sb.from("appeals")
      .select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
    const box = document.getElementById("appealList");
    if (!data || !data.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">暂无申诉</div>'; return; }
    box.innerHTML = data.map((a) => {
      const [t, c] = STATUS[a.status] || ["待处理", "amber"];
      return `<div class="news-item">
        <div class="t">${a.kind === "score" ? "分数异议" : "题目异议"} <span class="badge ${c}">${t}</span></div>
        <div class="meta">${API.fmtTime(a.created_at)}</div>
        <div class="body">${API.escapeHtml(a.content)}</div>
        ${a.reply ? `<div class="body" style="color:var(--blue-700)">组委会回复：${API.escapeHtml(a.reply)}</div>` : ""}
      </div>`;
    }).join("");
  }
})();
