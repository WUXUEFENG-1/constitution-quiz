/* 公告管理：发布 / 编辑 / 置顶 / 上下架 / 删除 / 附件上传 */
(function () {
  let list = [];
  const KIND = { notice: "通知", rule: "规则", result: "成绩公告" };
  const MAX_SIZE = 5 * 1024 * 1024; // 单个附件 5MB
  const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg";

  Admin.register("news", { load });

  async function load() {
    const { data } = await API.sb.from("announcements")
      .select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    list = data || [];
    document.getElementById("newsAddBtn").onclick = () => openEdit(null);
    render();
  }

  function parseAtt(raw) {
    try {
      const a = JSON.parse(raw || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function fmtSize(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + "B";
    if (b < 1048576) return (b / 1024).toFixed(1) + "KB";
    return (b / 1048576).toFixed(1) + "MB";
  }

  function attLinks(atts) {
    if (!atts || !atts.length) return "";
    const links = atts.map((a) =>
      `<a class="link-btn" href="${a.data}" download="${API.escapeHtml(a.name)}" target="_blank" rel="noopener" style="margin-right:14px;display:inline-block">附件：${API.escapeHtml(a.name)}（${fmtSize(a.size)}）</a>`
    ).join("");
    return `<div class="news-files" style="margin-top:6px">${links}</div>`;
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ name: file.name, type: file.type || "application/octet-stream", size: file.size, data: r.result });
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  function render() {
    const box = document.getElementById("newsList");
    if (!list.length) { box.innerHTML = '<div class="empty-state" style="padding:30px">暂无公告</div>'; return; }
    box.innerHTML = list.map((n) => `
      <div class="news-item">
        <div class="t">${n.pinned ? "📌 " : ""}${API.escapeHtml(n.title)}
          <span class="badge ${n.is_published ? "green" : "gray"}">${n.is_published ? "已发布" : "草稿"}</span>
          <span class="badge tag">${KIND[n.kind] || "通知"}</span>
        </div>
        <div class="meta">${API.fmtTime(n.created_at)}</div>
        <div class="body">${API.escapeHtml(n.content)}</div>
        ${attLinks(parseAtt(n.attachments))}
        <div class="op" style="margin-top:8px">
          <button class="link-btn" data-act="edit" data-id="${n.id}">编辑</button>
          <button class="link-btn" data-act="toggle" data-id="${n.id}">${n.is_published ? "下架" : "发布"}</button>
          <button class="link-btn" data-act="pin" data-id="${n.id}">${n.pinned ? "取消置顶" : "置顶"}</button>
          <button class="link-btn danger" data-act="del" data-id="${n.id}">删除</button>
        </div>
      </div>`).join("");
    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => onAction(b.dataset.act, b.dataset.id));
  }

  function find(id) { return list.find((x) => x.id === id); }

  async function onAction(act, id) {
    const n = find(id); if (!n) return;
    if (act === "edit") return openEdit(n);
    if (act === "toggle") return API.sb.from("announcements").update({ is_published: !n.is_published }).eq("id", n.id).then(load);
    if (act === "pin") return API.sb.from("announcements").update({ pinned: !n.pinned }).eq("id", n.id).then(load);
    if (act === "del") { if (await API.confirm("确认删除该公告？")) API.sb.from("announcements").delete().eq("id", n.id).then(load); }
  }

  function openEdit(n) {
    const f = n || { title: "", content: "", kind: "notice", pinned: false, is_published: true, attachments: null };
    let atts = parseAtt(f.attachments);

    const body = `
      <div class="field"><label>标题 <span class="req">*</span></label><input id="fTitle" value="${API.escapeHtml(f.title)}"></div>
      <div class="grid-2">
        <div class="field"><label>类型</label><select id="fKind">
          <option value="notice" ${f.kind === "notice" ? "selected" : ""}>通知</option>
          <option value="rule" ${f.kind === "rule" ? "selected" : ""}>竞赛规则</option>
          <option value="result" ${f.kind === "result" ? "selected" : ""}>成绩公告</option>
        </select></div>
        <div class="field"><label>选项</label>
          <label style="margin-right:12px"><input type="checkbox" id="fPin" ${f.pinned ? "checked" : ""}> 置顶</label>
          <label><input type="checkbox" id="fPub" ${f.is_published ? "checked" : ""}> 发布</label>
        </div>
      </div>
      <div class="field"><label>正文</label><textarea id="fContent" rows="4">${API.escapeHtml(f.content)}</textarea></div>
      <div class="field">
        <label>附件（可选，PDF / Word / Excel / PPT / 图片，单个不超过 5MB）</label>
        <input type="file" id="fFile" accept="${ACCEPT}" multiple>
        <div id="fFiles" style="margin-top:8px"></div>
      </div>`;

    Admin.openModal(n ? "编辑公告" : "发布公告", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("保存", "", async () => {
        const title = document.getElementById("fTitle").value.trim();
        if (!title) return API.toast("标题必填", "error");
        if (atts.length > 3) return API.toast("每条公告最多上传 3 个附件", "error");
        const payload = {
          title, content: document.getElementById("fContent").value.trim(),
          kind: document.getElementById("fKind").value,
          pinned: document.getElementById("fPin").checked,
          is_published: document.getElementById("fPub").checked,
          attachments: atts.length ? JSON.stringify(atts) : null,
          updated_at: new Date().toISOString()
        };
        if (n) {
          const { error } = await API.sb.from("announcements").update(payload).eq("id", n.id);
          if (error) return API.toast("保存失败：" + error.message, "error");
        } else {
          const { error } = await API.sb.from("announcements").insert(payload);
          if (error) return API.toast("发布失败：" + error.message, "error");
        }
        API.toast("公告已保存", "success"); Admin.closeModal(); load();
      })
    ]);

    const fileBox = document.getElementById("fFiles");
    function renderAttList() {
      if (!atts.length) {
        fileBox.innerHTML = '<div class="shot-name">暂无附件</div>';
        return;
      }
      fileBox.innerHTML = atts.map((a, i) => `
        <div class="shot-name" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>附件：${API.escapeHtml(a.name)}（${fmtSize(a.size)}）</span>
          <button type="button" class="link-btn danger" data-rm="${i}">移除</button>
        </div>`).join("");
      fileBox.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        atts.splice(Number(b.dataset.rm), 1);
        renderAttList();
      });
    }
    renderAttList();

    document.getElementById("fFile").onchange = async (e) => {
      const files = [...e.target.files];
      for (const file of files) {
        if (file.size > MAX_SIZE) { API.toast(`文件 ${file.name} 超过 5MB，未上传`, "error"); continue; }
        try { atts.push(await readFile(file)); }
        catch (_) { API.toast("读取失败：" + file.name, "error"); }
      }
      e.target.value = "";
      renderAttList();
    };
  }
})();
