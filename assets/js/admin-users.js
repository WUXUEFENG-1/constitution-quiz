/* 用户管理：账号、角色、状态、密码重置、批量导入 */
(function () {
  let all = [];

  Admin.register("users", { load });

  async function load() {
    const { data } = await API.sb.from("profiles").select("*").order("created_at", { ascending: false });
    all = data || [];
    document.getElementById("userCount").textContent = `共 ${all.length} 个账号`;
    bindFilters();
    render();
  }

  function bindFilters() {
    ["userSearch", "userRole", "userStatus"].forEach((id) => {
      const el = document.getElementById(id);
      el.oninput = render; el.onchange = render;
    });
    document.getElementById("userRefresh").onclick = load;
    document.getElementById("userAddBtn").onclick = openAdd;
    document.getElementById("userImportBtn").onclick = () => document.getElementById("userFile").click();
    document.getElementById("userFile").onchange = onImportFile;
  }

  function filtered() {
    const kw = document.getElementById("userSearch").value.trim().toLowerCase();
    const role = document.getElementById("userRole").value;
    const status = document.getElementById("userStatus").value;
    return all.filter((u) => {
      if (role && u.role !== role) return false;
      if (status && u.status !== status) return false;
      if (kw && ![u.full_name, u.student_no, u.class_name, u.department].some((v) => String(v || "").toLowerCase().includes(kw))) return false;
      return true;
    });
  }

  function render() {
    const rows = filtered();
    const body = document.getElementById("userBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">无匹配账号</td></tr>'; return; }
    body.innerHTML = rows.map((u) => `
      <tr>
        <td>${API.escapeHtml(u.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(u.student_no || "—")}</td>
        <td>${API.escapeHtml(u.department || "—")}</td>
        <td>${API.escapeHtml(u.class_name || "—")}</td>
        <td><span class="role-chip">${API.roleLabel(u.role)}</span></td>
        <td><span class="status-dot ${u.status === "banned" ? "off" : "on"}"></span>${u.status === "banned" ? "已封禁" : "正常"}</td>
        <td>${API.fmtTime(u.created_at)}</td>
        <td class="op">
          <button class="link-btn" data-act="role" data-id="${u.id}">角色</button>
          <button class="link-btn" data-act="pwd" data-id="${u.id}">重置密码</button>
          <button class="link-btn" data-act="ban" data-id="${u.id}">${u.status === "banned" ? "解封" : "封禁"}</button>
          <button class="link-btn danger" data-act="del" data-id="${u.id}">删除</button>
        </td>
      </tr>`).join("");
    body.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => onAction(b.dataset.act, b.dataset.id));
  }

  function find(id) { return all.find((u) => u.id === id); }

  function onAction(act, id) {
    const u = find(id);
    if (!u) return;
    if (act === "role") return editRole(u);
    if (act === "pwd") return resetPwd(u);
    if (act === "ban") return toggleBan(u);
    if (act === "del") return delUser(u);
  }

  function editRole(u) {
    const roles = ["contestant", "admin", "sub_admin", "questioner", "proctor", "statistician"];
    const body = `<div class="field"><label>角色</label><select id="fRole">${roles.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${API.roleLabel(r)}</option>`).join("")}</select></div>`;
    Admin.openModal(`调整角色 · ${u.full_name}`, body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("保存", "", async () => {
        const role = document.getElementById("fRole").value;
        const { error } = await API.sb.rpc("admin_set_role", { p_user_id: u.id, p_role: role });
        if (error) return API.toast("失败：" + error.message, "error");
        API.toast("角色已更新", "success"); Admin.closeModal(); load();
      })
    ]);
  }

  function resetPwd(u) {
    const body = `<div class="field"><label>新密码（至少 6 位）</label><input type="text" id="fPwd" value="${Math.random().toString(36).slice(2, 10)}"></div>`;
    Admin.openModal(`重置密码 · ${u.full_name}`, body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("确认重置", "", async () => {
        const pwd = document.getElementById("fPwd").value.trim();
        if (pwd.length < 6) return API.toast("密码至少 6 位", "error");
        const { error } = await API.sb.rpc("admin_reset_password", { p_user_id: u.id, p_new_password: pwd });
        if (error) return API.toast("失败：" + error.message, "error");
        API.toast("密码已重置，已生成新密码", "success"); Admin.closeModal();
      })
    ]);
  }

  async function toggleBan(u) {
    const ban = u.status !== "banned";
    const reason = ban ? prompt("封禁原因（可留空）：") : null;
    const { error } = await API.sb.rpc("admin_set_status", { p_user_id: u.id, p_status: ban ? "banned" : "active", p_reason: reason || null });
    if (error) return API.toast("失败：" + error.message, "error");
    API.toast(ban ? "已封禁该账号" : "已解封", "success"); load();
  }

  async function delUser(u) {
    if (!confirm(`确认删除账号 ${u.full_name}（${u.student_no}）？该操作不可恢复。`)) return;
    const { error } = await API.sb.rpc("admin_delete_user", { p_user_id: u.id });
    if (error) return API.toast("失败：" + error.message, "error");
    API.toast("账号已删除", "success"); load();
  }

  function openAdd() {
    const body = `
      <div class="grid-2">
        <div class="field"><label>姓名 <span class="req">*</span></label><input id="fName"></div>
        <div class="field"><label>学号 <span class="req">*</span></label><input id="fNo"></div>
        <div class="field"><label>系部</label><input id="fDept"></div>
        <div class="field"><label>班级</label><input id="fClass"></div>
        <div class="field"><label>手机号</label><input id="fPhone"></div>
        <div class="field"><label>角色</label><select id="fRole"><option value="contestant">选手</option><option value="questioner">出题员</option><option value="proctor">监考员</option><option value="statistician">统计员</option><option value="sub_admin">子管理员</option></select></div>
      </div>
      <div class="field"><label>初始密码 <span class="req">*</span></label><input id="fPwd" value="${Math.random().toString(36).slice(2, 10)}"></div>`;
    Admin.openModal("新增账号", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("创建", "", createUser)
    ]);
  }

  async function createUser() {
    const full_name = document.getElementById("fName").value.trim();
    const student_no = document.getElementById("fNo").value.trim();
    const department = document.getElementById("fDept").value.trim();
    const class_name = document.getElementById("fClass").value.trim();
    const phone = document.getElementById("fPhone").value.trim();
    const role = document.getElementById("fRole").value;
    const password = document.getElementById("fPwd").value.trim();
    if (!full_name || !student_no) return API.toast("姓名与学号必填", "error");
    if (password.length < 6) return API.toast("密码至少 6 位", "error");
    const email = student_no + "@xfjs.local";
    const { data, error } = await API.sb.auth.signUp({
      email, password,
      options: { data: { full_name, student_no, department, class_name, phone, role } }
    });
    if (error) return API.toast("创建失败：" + error.message, "error", 4000);
    const uid = data.user && data.user.id;
    if (uid) {
      await API.sb.from("profiles").upsert({ id: uid, full_name, student_no, department, class_name, phone, role, status: "active" });
    }
    API.toast("账号已创建", "success"); Admin.closeModal(); load();
  }

  async function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await API.parseTableFile(file);
      if (!rows.length) return API.toast("未解析到有效行", "error");
      const ok = confirm(`解析到 ${rows.length} 条记录，是否批量创建账号？初始密码统一为 xfjs2026。`);
      if (!ok) return;
      let success = 0, fail = 0;
      for (const r of rows) {
        const full_name = String(r["姓名"] || r["name"] || "").trim();
        const student_no = String(r["学号"] || r["no"] || "").trim();
        if (!full_name || !student_no) { fail++; continue; }
        const department = String(r["系部"] || r["部门"] || "").trim();
        const class_name = String(r["班级"] || "").trim();
        const phone = String(r["手机号"] || r["电话"] || "").trim();
        const email = student_no + "@xfjs.local";
        const su = await API.sb.auth.signUp({ email, password: "xfjs2026", options: { data: { full_name, student_no, department, class_name, phone } } });
        if (su.error) { fail++; continue; }
        const uid = su.data.user && su.data.user.id;
        if (uid) await API.sb.from("profiles").upsert({ id: uid, full_name, student_no, department, class_name, phone, role: "contestant", status: "active" });
        success++;
      }
      API.toast(`导入完成：成功 ${success}，失败 ${fail}`, success ? "success" : "error");
      load();
    } catch (err) {
      API.toast("导入失败：" + (err.message || err), "error", 4000);
    }
    e.target.value = "";
  }
})();
