/* 申诉管理：查看、审核、回复 */
(function () {
  let all = [];
  const STATUS = { pending: ["待处理", "amber"], approved: ["已采纳", "green"], rejected: ["未采纳", "red"] };

  Admin.register("appeals", { load });

  async function load() {
    const { data } = await API.sb.from("appeals")
      .select("*")
      .order("created_at", { ascending: false });
    all = data || [];
    const pMap = await API.profileMap(all.map((a) => a.user_id));
    all.forEach((a) => { a.profiles = pMap[a.user_id] || {}; });
    document.getElementById("appealCount").textContent = `共 ${all.length} 条，待处理 ${all.filter((a) => a.status === "pending").length} 条`;
    render();
  }

  function render() {
    const body = document.getElementById("appealBody");
    if (!all.length) { body.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center">暂无申诉</td></tr>'; return; }
    body.innerHTML = all.map((a) => {
      const p = a.profiles || {};
      const [t, c] = STATUS[a.status] || ["待处理", "amber"];
      return `<tr>
        <td>${API.escapeHtml(p.full_name || "—")}<div class="muted mono" style="font-size:12px">${API.escapeHtml(p.student_no || "")}</div></td>
        <td>${a.kind === "score" ? "分数异议" : "题目异议"}</td>
        <td style="max-width:320px">${API.escapeHtml(a.content)}${a.screenshot ? `<div><img class="appeal-thumb" src="${a.screenshot}" alt="截图"></div>` : ""}</td>
        <td><span class="badge ${c}">${t}</span></td>
        <td style="max-width:260px">${API.escapeHtml(a.reply || "—")}</td>
        <td>${API.fmtTime(a.created_at)}</td>
        <td><button class="link-btn" data-id="${a.id}">审核回复</button></td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => openReply(b.dataset.id));
  }

  function openReply(id) {
    const a = all.find((x) => x.id === id); if (!a) return;
    const body = `
      <div class="notice">${API.escapeHtml(a.content)}</div>
      <div class="field"><label>审核结论</label><select id="fStatus">
        <option value="pending" ${a.status === "pending" ? "selected" : ""}>待处理</option>
        <option value="approved" ${a.status === "approved" ? "selected" : ""}>采纳</option>
        <option value="rejected" ${a.status === "rejected" ? "selected" : ""}>不采纳</option>
      </select></div>
      <div class="field"><label>回复内容</label><textarea id="fReply" rows="3">${API.escapeHtml(a.reply)}</textarea></div>`;
    Admin.openModal(`审核申诉 · ${(a.profiles || {}).full_name || ""}`, body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("提交审核", "", async () => {
        const status = document.getElementById("fStatus").value;
        const reply = document.getElementById("fReply").value.trim();
        const { error } = await API.sb.rpc("staff_reply_appeal", { p_id: a.id, p_status: status, p_reply: reply });
        if (error) return API.toast("失败：" + error.message, "error");
        API.toast("审核结果已回复选手", "success"); Admin.closeModal(); load();
      })
    ]);
  }
})();
