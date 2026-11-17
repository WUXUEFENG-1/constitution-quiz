/* 公告管理：发布 / 编辑 / 置顶 / 上下架 / 删除 */
(function () {
  let list = [];
  const KIND = { notice: "通知", rule: "规则", result: "成绩公告" };

  Admin.register("news", { load });

  async function load() {
    const { data } = await API.sb.from("announcements")
      .select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    list = data || [];
    document.getElementById("newsAddBtn").onclick = () => openEdit(null);
    render();
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

  function onAction(act, id) {
    const n = find(id); if (!n) return;
    if (act === "edit") return openEdit(n);
    if (act === "toggle") return API.sb.from("announcements").update({ is_published: !n.is_published }).eq("id", n.id).then(load);
    if (act === "pin") return API.sb.from("announcements").update({ pinned: !n.pinned }).eq("id", n.id).then(load);
    if (act === "del") { if (confirm("确认删除该公告？")) API.sb.from("announcements").delete().eq("id", n.id).then(load); }
  }

  function openEdit(n) {
    const f = n || { title: "", content: "", kind: "notice", pinned: false, is_published: true };
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
      <div class="field"><label>正文</label><textarea id="fContent" rows="4">${API.escapeHtml(f.content)}</textarea></div>`;
    Admin.openModal(n ? "编辑公告" : "发布公告", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("保存", "", async () => {
        const title = document.getElementById("fTitle").value.trim();
        if (!title) return API.toast("标题必填", "error");
        const payload = {
          title, content: document.getElementById("fContent").value.trim(),
          kind: document.getElementById("fKind").value,
          pinned: document.getElementById("fPin").checked,
          is_published: document.getElementById("fPub").checked,
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
  }
})();
