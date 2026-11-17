/* 题库管理：CRUD、分类、Excel/CSV 直读、Word/PDF 经 DeepSeek 解析入库 */
(function () {
  let questions = [], categories = [], pendingImport = [], selected = new Set();

  Admin.register("questions", { load });

  async function load() {
    await Promise.all([loadQuestions(), loadCategories()]);
    bind();
    render();
  }

  async function loadQuestions() {
    const { data } = await API.sb.from("questions").select("*").order("sort_no", { ascending: true });
    questions = data || [];
  }
  async function loadCategories() {
    const { data } = await API.sb.from("question_categories").select("*").order("sort_no");
    categories = data || [];
    const sel = document.getElementById("qCategory");
    const cur = sel.value;
    sel.innerHTML = '<option value="">全部分类</option>' +
      categories.map((c) => `<option value="${c.id}">${API.escapeHtml(c.name)}</option>`).join("");
    sel.value = cur;
  }

  function bind() {
    ["qSearch", "qType", "qCategory"].forEach((id) => {
      const el = document.getElementById(id);
      el.oninput = render; el.onchange = render;
    });
    document.getElementById("qAddBtn").onclick = () => openEdit(null);
    document.getElementById("qImportBtn").onclick = () => document.getElementById("qFile").click();
    document.getElementById("qTemplateBtn").onclick = downloadTemplate;
    document.getElementById("qFile").onchange = onImportFile;
    document.getElementById("qBulkDel").onclick = bulkDelete;
    document.getElementById("qCheckAll").onchange = (e) => {
      filtered().forEach((q) => e.target.checked ? selected.add(q.id) : selected.delete(q.id));
      render();
    };
  }

  function filtered() {
    const kw = document.getElementById("qSearch").value.trim().toLowerCase();
    const type = document.getElementById("qType").value;
    const cat = document.getElementById("qCategory").value;
    return questions.filter((q) => {
      if (type && q.qtype !== type) return false;
      if (cat && String(q.category_id) !== cat) return false;
      if (kw && !q.content.toLowerCase().includes(kw)) return false;
      return true;
    });
  }

  function catName(id) { const c = categories.find((x) => x.id === id); return c ? c.name : "—"; }

  function render() {
    const rows = filtered();
    document.getElementById("qCount").textContent = `共 ${rows.length} 题`;
    const body = document.getElementById("qBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center">暂无题目</td></tr>'; return; }
    body.innerHTML = rows.map((q, i) => `
      <tr>
        <td><input type="checkbox" class="q-check" data-check="${q.id}" ${selected.has(q.id) ? "checked" : ""}></td>
        <td>${i + 1}</td>
        <td><span class="badge tag">${API.typeLabel(q.qtype)}</span></td>
        <td>${API.escapeHtml(catName(q.category_id))}</td>
        <td style="max-width:380px">${API.escapeHtml(q.content)}</td>
        <td class="mono">${API.answerText(q.qtype, q.answer)}</td>
        <td>${q.score}</td>
        <td><span class="status-dot ${q.is_active ? "on" : "off"}"></span>${q.is_active ? "启用" : "停用"}</td>
        <td class="op">
          <button class="link-btn" data-act="edit" data-id="${q.id}">编辑</button>
          <button class="link-btn" data-act="toggle" data-id="${q.id}">${q.is_active ? "停用" : "启用"}</button>
          <button class="link-btn danger" data-act="del" data-id="${q.id}">删除</button>
        </td>
      </tr>`).join("");
    body.querySelectorAll("[data-check]").forEach((c) => c.onchange = () => {
      c.checked ? selected.add(c.dataset.check) : selected.delete(c.dataset.check);
    });
    body.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => onAction(b.dataset.act, b.dataset.id));
  }

  async function bulkDelete() {
    if (!selected.size) return API.toast("请先勾选要删除的题目", "error");
    if (!await API.confirm(`确认删除所选 ${selected.size} 道题目？`)) return;
    const { error } = await API.sb.from("questions").delete().in("id", [...selected]);
    if (error) return API.toast("批量删除失败：" + error.message, "error");
    API.toast(`已删除 ${selected.size} 题`, "success");
    selected.clear(); load();
  }

  function find(id) { return questions.find((q) => q.id === id); }

  function onAction(act, id) {
    const q = find(id);
    if (!q) return;
    if (act === "edit") return openEdit(q);
    if (act === "toggle") return toggle(q);
    if (act === "del") return del(q);
  }

  async function toggle(q) {
    await API.sb.from("questions").update({ is_active: !q.is_active }).eq("id", q.id);
    load();
  }
  async function del(q) {
    if (!await API.confirm("确认删除该题目？")) return;
    await API.sb.from("questions").delete().eq("id", q.id);
    API.toast("已删除", "success"); load();
  }

  function openEdit(q) {
    const isNew = !q;
    const f = q || { qtype: "single", options: [], answer: [], analysis: "", score: 2, is_active: true, category_id: "" };
    const body = `
      <div class="grid-2">
        <div class="field"><label>题型</label><select id="fType">
          <option value="single" ${f.qtype === "single" ? "selected" : ""}>单选题</option>
          <option value="multiple" ${f.qtype === "multiple" ? "selected" : ""}>多选题</option>
          <option value="judge" ${f.qtype === "judge" ? "selected" : ""}>判断题</option>
          <option value="fill" ${f.qtype === "fill" ? "selected" : ""}>填空题</option>
        </select></div>
        <div class="field"><label>分类</label><select id="fCat">
          <option value="">未分类</option>
          ${categories.map((c) => `<option value="${c.id}" ${String(f.category_id) === String(c.id) ? "selected" : ""}>${API.escapeHtml(c.name)}</option>`).join("")}
        </select></div>
      </div>
      <div class="field"><label>题干 <span class="req">*</span></label><textarea id="fContent" rows="2">${API.escapeHtml(f.content || "")}</textarea></div>
      <div class="field" id="fOptWrap"><label>选项（每行一个；判断题固定 正确 / 错误）</label>
        <textarea id="fOptions" rows="4">${(f.options || []).join("\n")}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>正确答案（多选/字母用逗号分隔；填空填各空答案）</label><input id="fAnswer" value="${(f.answer || []).join(",")}"></div>
        <div class="field"><label>分值</label><input type="number" id="fScore" min="1" value="${f.score || 2}"></div>
      </div>
      <div class="field"><label>解析</label><textarea id="fAnalysis" rows="2">${API.escapeHtml(f.analysis || "")}</textarea></div>
      <div class="field"><label><input type="checkbox" id="fActive" ${f.is_active ? "checked" : ""}> 启用本题</label></div>`;
    Admin.openModal(isNew ? "新增题目" : "编辑题目", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn("保存", "", () => saveEdit(q))
    ]);
  }

  async function saveEdit(q) {
    const qtype = document.getElementById("fType").value;
    const content = document.getElementById("fContent").value.trim();
    if (!content) return API.toast("题干必填", "error");
    let options = document.getElementById("fOptions").value.split("\n").map((s) => s.trim()).filter(Boolean);
    let answer = document.getElementById("fAnswer").value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const analysis = document.getElementById("fAnalysis").value.trim();
    const score = Number(document.getElementById("fScore").value) || 2;
    const is_active = document.getElementById("fActive").checked;
    const category_id = document.getElementById("fCat").value || null;
    if (qtype === "judge") options = ["正确", "错误"];
    if (qtype !== "fill" && qtype !== "judge" && !options.length) return API.toast("请填写选项", "error");
    if (!answer.length) return API.toast("请填写正确答案", "error");

    const payload = { qtype, content, options, answer, analysis, score, is_active, category_id };
    if (q) {
      const { error } = await API.sb.from("questions").update(payload).eq("id", q.id);
      if (error) return API.toast("保存失败：" + error.message, "error");
    } else {
      const { error } = await API.sb.from("questions").insert(payload);
      if (error) return API.toast("保存失败：" + error.message, "error");
    }
    API.toast("题目已保存", "success"); Admin.closeModal(); load();
  }

  function downloadTemplate() {
    API.downloadCSV("题库导入模板.csv", [
      ["题型", "题干", "选项A", "选项B", "选项C", "选项D", "答案", "解析", "分值"],
      ["single", "我国宪法规定，中华人民共和国的一切权力属于谁？", "人民", "公民", "国家", "政府", "A", "宪法第二条规定一切权力属于人民", "2"],
      ["judge", "宪法是国家的根本法。", "", "", "", "", "A", "", "2"],
      ["fill", "我国现行宪法是____年颁布的。", "", "", "", "", "1982", "", "2"]
    ]);
  }

  async function onImportFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const rows = await API.parseTableFile(file);
        pendingImport = rows.map(normalizeRow).filter(Boolean);
        previewImport(`从 ${file.name} 解析出 ${pendingImport.length} 道题`);
      } else {
        API.toast("正在提取文档文本并调用 DeepSeek 解析…", "info", 4000);
        const text = await API.extractDocText(file);
        pendingImport = await API.deepseekParse(text, "文档中可能包含单选、多选、判断、填空。");
        pendingImport = pendingImport.map(normalizeParsed).filter(Boolean);
        previewImport(`DeepSeek 从 ${file.name} 解析出 ${pendingImport.length} 道题`);
      }
    } catch (err) {
      API.toast("导入失败：" + (err.message || err), "error", 4000);
    }
  }

  function normalizeRow(r) {
    const qtype = mapType(r["题型"]);
    const content = String(r["题干"] || r["题目"] || "").trim();
    if (!qtype || !content) return null;
    const options = ["选项A", "选项B", "选项C", "选项D", "选项E"]
      .map((k) => String(r[k] || "").trim()).filter(Boolean);
    const answer = String(r["答案"] || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    return {
      qtype, content,
      options: qtype === "judge" ? ["正确", "错误"] : options,
      answer,
      analysis: String(r["解析"] || "").trim(),
      score: Number(r["分值"] || r["分数"] || 2) || 2,
      is_active: true, category_id: null
    };
  }

  function normalizeParsed(p) {
    const qtype = mapType(p.qtype);
    const content = String(p.content || "").trim();
    if (!qtype || !content) return null;
    return {
      qtype, content,
      options: Array.isArray(p.options) ? p.options.map(String) : [],
      answer: Array.isArray(p.answer) ? p.answer.map(String) : String(p.answer || "").split(/[,，]/).filter(Boolean),
      analysis: String(p.analysis || "").trim(),
      score: Number(p.score) || 2,
      is_active: true, category_id: null
    };
  }

  function mapType(t) {
    const s = String(t || "").toLowerCase();
    if (["single", "单选", "单选题", "single_choice"].includes(s)) return "single";
    if (["multiple", "多选", "多选题", "multiple_choice"].includes(s)) return "multiple";
    if (["judge", "判断", "判断题", "true_false"].includes(s)) return "judge";
    if (["fill", "填空", "填空题", "blank"].includes(s)) return "fill";
    return null;
  }

  function previewImport(title) {
    if (!pendingImport.length) return API.toast("没有可入库的题目", "error");
    const body = `
      <div class="notice" style="margin-bottom:12px">${API.escapeHtml(title)}，请核对后确认入库；判断题答案 A=正确，B=错误。</div>
      <div class="table-wrap" style="max-height:340px;overflow:auto">
        <table class="data"><thead><tr><th>题型</th><th>题干</th><th>答案</th><th>分值</th></tr></thead>
        <tbody>${pendingImport.map((q, i) => `
          <tr>
            <td><span class="badge tag">${API.typeLabel(q.qtype)}</span></td>
            <td>${API.escapeHtml(q.content)}</td>
            <td class="mono">${API.answerText(q.qtype, q.answer)}</td>
            <td>${q.score}</td>
          </tr>`).join("")}</tbody></table>
      </div>`;
    Admin.openModal("导入预览", body, [
      Admin.btn("取消", "ghost", Admin.closeModal),
      Admin.btn(`确认入库 ${pendingImport.length} 题`, "", confirmImport)
    ]);
  }

  async function confirmImport() {
    const { error } = await API.sb.from("questions").insert(pendingImport);
    if (error) return API.toast("入库失败：" + error.message, "error", 4000);
    API.toast(`成功导入 ${pendingImport.length} 题`, "success");
    pendingImport = []; Admin.closeModal(); load();
  }
})();
