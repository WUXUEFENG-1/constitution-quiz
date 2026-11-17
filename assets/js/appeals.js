/* 申诉提交与记录：选择竞赛、异议说明、截图佐证 */
(function () {
  let profile = null, competitions = [], shotData = null;
  const STATUS = { pending: ["待处理", "amber"], approved: ["已采纳", "green"], rejected: ["未采纳", "red"] };

  init();

  async function init() {
    try { const ctx = await API.guard("contestant"); profile = ctx.profile; } catch (e) { return; }
    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();

    await loadCompetitions();

    const qs = new URLSearchParams(location.search);
    if (qs.get("kind")) document.getElementById("aKind").value = qs.get("kind");
    if (qs.get("attempt")) document.getElementById("aAttempt").value = qs.get("attempt");
    if (qs.get("comp")) document.getElementById("aComp").value = qs.get("comp");

    document.getElementById("aShot").onchange = onPickShot;
    document.getElementById("appealForm").onsubmit = onSubmit;
    await loadList();
  }

  async function loadCompetitions() {
    const { data } = await API.sb.from("competitions").select("id,title").order("created_at", { ascending: false });
    competitions = data || [];
    const sel = document.getElementById("aComp");
    sel.innerHTML = competitions.length
      ? competitions.map((c) => `<option value="${c.id}">${API.escapeHtml(c.title)}</option>`).join("")
      : `<option value="">校园知识竞赛</option>`;
  }

  function onPickShot(e) {
    const file = e.target.files[0];
    shotData = null;
    const preview = document.getElementById("shotPreview");
    const name = document.getElementById("shotName");
    if (!file) { preview.hidden = true; name.textContent = ""; return; }
    if (file.size > 2 * 1024 * 1024) { API.toast("截图请控制在 2MB 以内", "error"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        shotData = canvas.toDataURL("image/jpeg", 0.72);
        preview.src = shotData; preview.hidden = false;
        name.textContent = file.name;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const kind = document.getElementById("aKind").value;
    const content = document.getElementById("aContent").value.trim();
    const attemptId = document.getElementById("aAttempt").value.trim() || null;
    const compId = document.getElementById("aComp").value || null;
    const qid = new URLSearchParams(location.search).get("qid");
    if (content.length < 5) return API.toast("申诉内容至少 5 个字", "error");
    try {
      const { error } = await API.sb.rpc("submit_appeal", {
        p_kind: kind, p_content: content, p_qid: qid || null,
        p_attempt_id: attemptId, p_competition_id: compId, p_screenshot: shotData
      });
      if (error) throw error;
      API.toast("申诉已提交，组委会将尽快审核", "success");
      document.getElementById("aContent").value = "";
      document.getElementById("aShot").value = "";
      document.getElementById("shotPreview").hidden = true;
      document.getElementById("shotName").textContent = "";
      shotData = null;
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
    const compMap = Object.fromEntries(competitions.map((c) => [c.id, c.title]));
    box.innerHTML = data.map((a) => {
      const [t, c] = STATUS[a.status] || ["待处理", "amber"];
      const comp = a.competition_id ? (compMap[a.competition_id] || "") : "";
      return `<div class="news-item">
        <div class="t">${a.kind === "score" ? "分数异议" : "题目异议"} <span class="badge ${c}">${t}</span></div>
        <div class="meta">${comp ? API.escapeHtml(comp) + " · " : ""}${API.fmtTime(a.created_at)}</div>
        <div class="body">${API.escapeHtml(a.content)}</div>
        ${a.screenshot ? `<img class="appeal-thumb" src="${a.screenshot}" alt="申诉截图">` : ""}
        ${a.reply ? `<div class="body" style="color:var(--navy-700)">组委会回复：${API.escapeHtml(a.reply)}</div>` : ""}
      </div>`;
    }).join("");
  }
})();
