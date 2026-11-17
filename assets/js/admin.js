/* 管理后台 */
(function () {
  const S = {
    registrations: [],
    questions: [],
    attempts: [],
    settings: null,
    regDept: ""
  };

  init();

  async function init() {
    try {
      const { profile } = await API.guard("admin");
      document.getElementById("userChip").textContent = (profile.full_name || "管理员") + " · 管理员";
    } catch (e) { return; }

    document.getElementById("logoutBtn").onclick = () => API.signOut();

    document.querySelectorAll("#tabs .tab").forEach((tab) => {
      tab.onclick = () => switchTab(tab.dataset.tab);
    });

    document.getElementById("regSearch").oninput = renderRegistrations;
    document.getElementById("regDept").onchange = (e) => { S.regDept = e.target.value; renderRegistrations(); };
    document.getElementById("regExport").onclick = exportRegistrations;
    document.getElementById("regRefresh").onclick = () => loadRegistrations().then(renderRegistrations);

    document.getElementById("qSearch").oninput = renderQuestions;
    document.getElementById("qType").onchange = renderQuestions;
    document.getElementById("qAddBtn").onclick = () => editQuestion(null);
    document.getElementById("qImportBtn").onclick = () => document.getElementById("qFile").click();
    document.getElementById("qTemplateBtn").onclick = downloadTemplate;
    document.getElementById("qFile").onchange = onFileSelected;

    document.getElementById("settingForm").onsubmit = saveSettings;
    document.getElementById("openNow").onclick = () => quickToggle(true);
    document.getElementById("closeNow").onclick = () => quickToggle(false);

    document.getElementById("scoreSearch").oninput = renderScores;
    document.getElementById("scoreStatus").onchange = renderScores;
    document.getElementById("scoreExport").onclick = exportScores;
    document.getElementById("scoreRefresh").onclick = () => loadAttempts().then(renderScores);

    await loadAll();
  }

  function switchTab(name) {
    document.querySelectorAll("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    ["overview", "registrations", "questions", "settings", "scores"].forEach((k) => {
      document.getElementById("panel-" + k).hidden = k !== name;
    });
    if (name === "overview") loadOverview();
  }

  async function loadAll() {
    await Promise.all([loadRegistrations(), loadQuestions(), loadSettings(), loadAttempts()]);
    renderRegistrations();
    renderQuestions();
    renderSettings();
    renderScores();
    loadOverview();
  }

  /* ---------------- 概览 ---------------- */
  async function loadOverview() {
    const regs = S.registrations;
    const ats = S.attempts;
    const submitted = ats.filter((a) => a.status === "submitted");
    const inProgress = ats.filter((a) => a.status === "in_progress");
    const avgRate = submitted.length
      ? Math.round(submitted.reduce((s, a) => s + (a.total_score > 0 ? a.score / a.total_score : 0), 0) / submitted.length * 100)
      : 0;

    document.getElementById("statCards").innerHTML = [
      ["报名人数", regs.length, "人"],
      ["已交卷", submitted.length, "人"],
      ["平均正确率", avgRate, "%"],
      ["题库题数", S.questions.length, "题"]
    ].map(([k, v, u]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`).join("");

    renderBars("deptBars", groupCount(regs, (r) => r.department || "未填写"));
    renderBars("stateBars", {
      "已交卷": submitted.length,
      "答题中（未交卷）": inProgress.length,
      "已报名未答题": Math.max(0, regs.length - submitted.length - inProgress.length)
    });

    const st = S.settings || {};
    const now = Date.now();
    const open = examIsOpen(st, now);
    document.getElementById("ovState").innerHTML = open
      ? '<span class="badge green">开放中</span>' : '<span class="badge gray">未开放</span>';
    document.getElementById("ovSetting").innerHTML = `
      <div class="grid-3">
        <div><div style="font-size:12.5px;color:var(--ink-3)">开放时间</div>
          <div style="font-weight:600">${st.start_at ? API.fmtTime(st.start_at) : "未设置"}</div></div>
        <div><div style="font-size:12.5px;color:var(--ink-3)">截止时间</div>
          <div style="font-weight:600">${st.end_at ? API.fmtTime(st.end_at) : "未设置"}</div></div>
        <div><div style="font-size:12.5px;color:var(--ink-3)">时长 / 抽题 / 顺序</div>
          <div style="font-weight:600">${st.duration_minutes || 30} 分钟 / ${st.question_count || 40} 题 / ${st.shuffle ? "随机" : "顺序"}</div></div>
      </div>
      ${st.note ? `<div class="notice" style="margin-top:12px">${API.escapeHtml(st.note)}</div>` : ""}`;
  }

  function examIsOpen(st, now) {
    if (!st.is_open) return false;
    const s = st.start_at ? new Date(st.start_at).getTime() : null;
    const e = st.end_at ? new Date(st.end_at).getTime() : null;
    if (s && now < s) return false;
    if (e && now > e) return false;
    return true;
  }

  function groupCount(list, keyFn) {
    const map = {};
    list.forEach((x) => {
      const k = keyFn(x);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function renderBars(elId, map) {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const el = document.getElementById(elId);
    if (!entries.length) {
      el.innerHTML = '<div class="empty-state" style="padding:20px">暂无数据</div>';
      return;
    }
    const max = Math.max(...entries.map((e) => e[1]));
    el.innerHTML = entries.map(([k, v]) => `
      <div class="bar-row">
        <div class="name" title="${API.escapeHtml(k)}">${API.escapeHtml(k)}</div>
        <div class="bar" style="width:${Math.max(4, Math.round((v / max) * 100))}%"></div>
        <div class="n">${v} 人</div>
      </div>`).join("");
  }

  /* ---------------- 报名 ---------------- */
  async function loadRegistrations() {
    const { data, error } = await API.sb
      .from("registrations")
      .select("id, full_name, student_no, department, class_name, phone, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    S.registrations = data || [];

    const depts = [...new Set(S.registrations.map((r) => r.department || "未填写"))].sort();
    const sel = document.getElementById("regDept");
    const keep = sel.value;
    sel.innerHTML = '<option value="">全部系部</option>' +
      depts.map((d) => `<option value="${API.escapeHtml(d)}">${API.escapeHtml(d)}</option>`).join("");
    sel.value = keep || "";
  }

  function renderRegistrations() {
    const kw = (document.getElementById("regSearch").value || "").trim().toLowerCase();
    const dept = S.regDept;
    const list = S.registrations.filter((r) => {
      const hitKw = !kw || [r.full_name, r.student_no, r.class_name].join(" ").toLowerCase().includes(kw);
      const hitDept = !dept || (r.department || "未填写") === dept;
      return hitKw && hitDept;
    });

    document.getElementById("regCount").textContent = `共 ${list.length} 人 / 总报名 ${S.registrations.length} 人`;
    document.getElementById("regBody").innerHTML = list.length
      ? list.map((r, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td>${API.escapeHtml(r.full_name)}</td>
          <td class="mono">${API.escapeHtml(r.student_no)}</td>
          <td>${API.escapeHtml(r.department || "—")}</td>
          <td>${API.escapeHtml(r.class_name || "—")}</td>
          <td class="mono">${API.escapeHtml(r.phone || "—")}</td>
          <td class="muted">${API.fmtTime(r.created_at)}</td>
        </tr>`).join("")
      : `<tr><td colspan="7"><div class="empty-state" style="padding:24px">暂无报名记录</div></td></tr>`;
  }

  function exportRegistrations() {
    if (!S.registrations.length) return API.toast("暂无报名数据", "error");
    const rows = [["序号", "姓名", "学号", "系部", "班级", "手机号", "报名时间"]];
    S.registrations.forEach((r, i) => rows.push([i + 1, r.full_name, r.student_no, r.department, r.class_name, r.phone, API.fmtTime(r.created_at)]));
    API.downloadCSV(`报名统计_${dateStamp()}.csv`, rows);
  }

  /* ---------------- 题库 ---------------- */
  async function loadQuestions() {
    const { data, error } = await API.sb
      .from("questions")
      .select("id, qtype, content, options, answer, analysis, score, is_active, sort_no")
      .order("sort_no", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    S.questions = data || [];
  }

  function renderQuestions() {
    const kw = (document.getElementById("qSearch").value || "").trim().toLowerCase();
    const type = document.getElementById("qType").value;
    const list = S.questions.filter((q) => {
      const hitKw = !kw || (q.content || "").toLowerCase().includes(kw);
      const hitType = !type || q.qtype === type;
      return hitKw && hitType;
    });
    document.getElementById("qCount").textContent =
      `共 ${list.length} 题 / 题库 ${S.questions.length} 题 · 总分 ${S.questions.reduce((s, q) => s + Number(q.score || 0), 0)} 分`;

    document.getElementById("qBody").innerHTML = list.length
      ? list.map((q, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><span class="badge">${API.typeLabel(q.qtype)}</span></td>
          <td>${API.escapeHtml(q.content)}</td>
          <td style="color:var(--green);font-weight:600">${API.escapeHtml(API.answerText(q.qtype, q.answer))}</td>
          <td class="mono">${q.score}</td>
          <td>${q.is_active ? '<span class="badge green">启用</span>' : '<span class="badge gray">停用</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn soft sm" data-edit="${q.id}">编辑</button>
            <button class="btn ghost sm" data-toggle="${q.id}">${q.is_active ? "停用" : "启用"}</button>
            <button class="btn danger sm" data-del="${q.id}">删除</button>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="7"><div class="empty-state" style="padding:24px">题库为空，请新增或批量导入</div></td></tr>`;

    document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editQuestion(S.questions.find((q) => q.id === b.dataset.edit)));
    document.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = () => toggleQuestion(b.dataset.toggle));
    document.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => deleteQuestion(b.dataset.del));
  }

  async function toggleQuestion(id) {
    const q = S.questions.find((x) => x.id === id);
    const { error } = await API.sb.from("questions").update({ is_active: !q.is_active }).eq("id", id);
    if (error) return API.toast("操作失败：" + error.message, "error");
    await loadQuestions(); renderQuestions(); loadOverview();
    API.toast(q.is_active ? "已停用该题" : "已启用该题", "success");
  }

  async function deleteQuestion(id) {
    if (!confirm("确定删除这道题？删除后不可恢复。")) return;
    const { error } = await API.sb.from("questions").delete().eq("id", id);
    if (error) return API.toast("删除失败：" + error.message, "error");
    await loadQuestions(); renderQuestions(); loadOverview();
    API.toast("已删除", "success");
  }

  /* 题目编辑弹窗 */
  function editQuestion(q) {
    const isNew = !q;
    const data = q || { qtype: "single", content: "", options: [], answer: [], analysis: "", score: 2, is_active: true };

    const body = `
      <div class="field">
        <label>题型</label>
        <select id="mType">
          <option value="single">单选题</option>
          <option value="multiple">多选题</option>
          <option value="judge">判断题</option>
          <option value="fill">填空题</option>
        </select>
      </div>
      <div class="field">
        <label>题干 <span class="req">*</span></label>
        <textarea id="mContent" placeholder="请输入题干"></textarea>
      </div>
      <div id="mOptionsBox">
        <div class="grid-2">
          ${["A", "B", "C", "D"].map((L) => `<div class="field"><label>选项 ${L}</label><input type="text" id="mOpt${L}" placeholder="选项 ${L} 内容"></div>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>正确答案 <span class="req">*</span></label>
        <input type="text" id="mAnswer" placeholder="单选填 A；多选填 ABD；判断填 正确/错误；填空多个空用 | 分隔">
        <div class="hint" id="mAnswerHint"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>分值</label><input type="number" id="mScore" min="0.5" step="0.5" value="2"></div>
        <div class="field"><label>状态</label>
          <select id="mActive"><option value="1">启用</option><option value="0">停用</option></select>
        </div>
      </div>
      <div class="field">
        <label>解析（可选）</label>
        <textarea id="mAnalysis" placeholder="填写答案解析，选手复盘时可见"></textarea>
      </div>`;

    openModal(isNew ? "新增题目" : "编辑题目", body, async () => {
      const qtype = document.getElementById("mType").value;
      const content = document.getElementById("mContent").value.trim();
      if (!content) throw new Error("请填写题干");

      const optVals = ["A", "B", "C", "D"].map((L) => document.getElementById("mOpt" + L).value.trim());
      let options = [];
      if (qtype === "judge") options = ["正确", "错误"];
      else if (qtype !== "fill") {
        options = optVals.filter((v) => v !== "");
        if (options.length < 2) throw new Error("选择题至少需要填写 2 个选项");
      }

      const answerText = document.getElementById("mAnswer").value.trim();
      if (!answerText) throw new Error("请填写正确答案");
      const answer = parseAnswer(qtype, answerText);

      const score = Number(document.getElementById("mScore").value) || 2;
      if (score <= 0) throw new Error("分值必须大于 0");

      const payload = {
        qtype,
        content,
        options,
        answer,
        score,
        is_active: document.getElementById("mActive").value === "1",
        analysis: document.getElementById("mAnalysis").value.trim()
      };

      const { error } = isNew
        ? await API.sb.from("questions").insert(payload)
        : await API.sb.from("questions").update(payload).eq("id", q.id);
      if (error) throw error;

      API.toast(isNew ? "题目已新增" : "题目已更新", "success");
      await loadQuestions(); renderQuestions(); loadOverview();
    });

    // 回填
    document.getElementById("mType").value = data.qtype;
    document.getElementById("mContent").value = data.content || "";
    const opts = data.options || [];
    ["A", "B", "C", "D"].forEach((L, i) => (document.getElementById("mOpt" + L).value = opts[i] || ""));
    document.getElementById("mAnswer").value = answerToInput(data.qtype, data.answer);
    document.getElementById("mScore").value = data.score || 2;
    document.getElementById("mAnalysis").value = data.analysis || "";
    document.getElementById("mActive").value = data.is_active === false ? "0" : "1";
    syncModalType();

    document.getElementById("mType").onchange = syncModalType;
  }

  function syncModalType() {
    const t = document.getElementById("mType").value;
    const box = document.getElementById("mOptionsBox");
    box.style.display = t === "judge" ? "none" : "";
    box.querySelectorAll(".field").forEach((f) => (f.style.display = t === "fill" ? "none" : ""));
    const hints = {
      single: "单选：填写选项字母，例如 A",
      multiple: "多选：填写多个字母，例如 ABD 或 A,B,D（必须全对才得分）",
      judge: "判断：填写 正确 或 错误",
      fill: "填空：多个空按顺序用 | 分隔，例如 人民|全国人民代表大会"
    };
    document.getElementById("mAnswerHint").textContent = hints[t] || "";
  }

  function parseAnswer(qtype, text) {
    const t = text.trim();
    if (qtype === "judge") {
      if (/^[A对√正]$|对|正确|true/i.test(t)) return ["A"];
      if (/^[B错×误]$|错|错误|false/i.test(t)) return ["B"];
      throw new Error("判断题答案请填写“正确”或“错误”");
    }
    if (qtype === "fill") {
      const parts = t.split("|").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) throw new Error("请填写填空答案");
      return parts;
    }
    const letters = t.toUpperCase().replace(/[^A-F]/g, "").split("");
    const uniq = [...new Set(letters)];
    if (!uniq.length) throw new Error("请填写选项字母");
    if (qtype === "single" && uniq.length > 1) throw new Error("单选题答案只能有一个字母");
    return uniq;
  }

  function answerToInput(qtype, answer) {
    const arr = Array.isArray(answer) ? answer : [];
    if (qtype === "judge") return arr[0] === "B" ? "错误" : "正确";
    if (qtype === "fill") return arr.join("|");
    return arr.join("");
  }

  /* 批量导入 */
  function downloadTemplate() {
    const rows = [
      ["题型", "题干", "选项A", "选项B", "选项C", "选项D", "正确答案", "分值", "解析"],
      ["单选", "我国现行宪法是哪一年通过的？", "1954年", "1978年", "1982年", "1988年", "C", "2", "现行宪法于1982年12月4日通过。"],
      ["多选", "我国宪法规定的公民基本权利包括哪些？", "平等权", "政治权利和自由", "人身自由", "宗教信仰自由", "ABCD", "4", "见宪法第二章。"],
      ["判断", "宪法是国家的根本法，修改程序比普通法律更严格。", "", "", "", "", "正确", "2", "宪法第六十四条。"],
      ["填空", "中华人民共和国的一切权力属于____。", "", "", "", "", "人民", "2", "宪法第二条。"]
    ];
    API.downloadCSV("题库导入模板.csv", rows);
  }

  function onFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        const isCsv = /\.csv$/i.test(file.name || "");
        let wb;
        if (isCsv) {
          // CSV 先按 UTF-8 解码（BOM 自动忽略）；出现乱码时回退 GB18030，兼容 Windows 版 Excel 另存的文件
          let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
          if (/\uFFFD/.test(text)) {
            text = new TextDecoder("gb18030", { fatal: false }).decode(bytes);
          }
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(bytes, { type: "array" });
        }
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        importRows(rows);
      } catch (err) {
        API.toast("文件解析失败：" + (err.message || err), "error", 4000);
      }
    };
    reader.onerror = () => API.toast("文件读取失败", "error");
    reader.readAsArrayBuffer(file);
  }

  async function importRows(rows) {
    const list = rows.filter((r) => r && r.length && String(r[0] || "").trim() !== "");
    if (!list.length) return API.toast("文件内容为空", "error");

    // 跳过表头
    if (/题型|type/i.test(String(list[0][0] || ""))) list.shift();

    const typeMap = {
      "单选": "single", "单选题": "single", "single": "single",
      "多选": "multiple", "多选题": "multiple", "multiple": "multiple",
      "判断": "judge", "判断题": "judge", "judge": "judge",
      "填空": "fill", "填空题": "fill", "fill": "fill"
    };

    const out = [];
    const errors = [];
    list.forEach((r, i) => {
      const rowNo = i + 2;
      const qtypeRaw = String(r[0] || "").trim();
      const qtype = typeMap[qtypeRaw];
      const content = String(r[1] || "").trim();
      if (!qtype) return errors.push(`第 ${rowNo} 行：题型“${qtypeRaw}”无法识别`);
      if (!content) return errors.push(`第 ${rowNo} 行：题干为空`);

      let options = [];
      if (qtype === "judge") options = ["正确", "错误"];
      else if (qtype !== "fill") {
        options = [r[2], r[3], r[4], r[5]].map((x) => String(x || "").trim()).filter(Boolean);
        if (options.length < 2) return errors.push(`第 ${rowNo} 行：选项不足 2 个`);
      }

      let answer;
      try {
        answer = parseAnswer(qtype, String(r[6] || "").trim());
      } catch (err) {
        return errors.push(`第 ${rowNo} 行：${err.message}`);
      }
      const score = Number(r[7]) > 0 ? Number(r[7]) : 2;
      out.push({ qtype, content, options, answer, score, analysis: String(r[8] || "").trim(), is_active: true });
    });

    if (!out.length) {
      return openModal("导入失败", `<div class="notice danger">${errors.slice(0, 12).map(API.escapeHtml).join("<br>")}</div>`, null, "关闭");
    }

    const summary = `
      <div class="notice ok">识别到 <b>${out.length}</b> 道有效题目${errors.length ? `，另有 <b>${errors.length}</b> 行有问题被跳过` : ""}。</div>
      ${errors.length ? `<div class="notice warn" style="margin-top:10px;max-height:180px;overflow:auto">${errors.slice(0, 15).map(API.escapeHtml).join("<br>")}</div>` : ""}
      <div class="q-preview" style="margin-top:12px">
        示例：<b>${API.typeLabel(out[0].qtype)}</b> · ${API.escapeHtml(out[0].content)}　答案：<b>${API.escapeHtml(API.answerText(out[0].qtype, out[0].answer))}</b>
      </div>
      <div style="margin-top:12px;font-size:13px;color:var(--ink-3)">导入将与现有题库合并，不会删除已有题目。</div>`;

    openModal("确认导入题库", summary, async () => {
      const batches = [];
      for (let i = 0; i < out.length; i += 100) batches.push(out.slice(i, i + 100));
      for (const b of batches) {
        const { error } = await API.sb.from("questions").insert(b);
        if (error) throw error;
      }
      API.toast(`成功导入 ${out.length} 道题`, "success");
      await loadQuestions(); renderQuestions(); loadOverview();
    }, "确认导入");
  }

  /* ---------------- 设置 ---------------- */
  async function loadSettings() {
    const { data, error } = await API.sb
      .from("exam_settings")
      .select("is_open, start_at, end_at, duration_minutes, question_count, shuffle, note")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    S.settings = data || {};
  }

  function renderSettings() {
    const st = S.settings || {};
    document.getElementById("sOpen").value = st.is_open ? "1" : "0";
    document.getElementById("sCount").value = st.question_count || 40;
    document.getElementById("sDuration").value = st.duration_minutes || 30;
    document.getElementById("sShuffle").value = st.shuffle ? "1" : "0";
    document.getElementById("sStart").value = API.toLocalInput(st.start_at);
    document.getElementById("sEnd").value = API.toLocalInput(st.end_at);
    document.getElementById("sNote").value = st.note || "";
  }

  function readSettingForm() {
    const start = document.getElementById("sStart").value;
    const end = document.getElementById("sEnd").value;
    const patch = {
      is_open: document.getElementById("sOpen").value === "1",
      question_count: Math.max(1, parseInt(document.getElementById("sCount").value || "40", 10)),
      duration_minutes: Math.max(1, parseInt(document.getElementById("sDuration").value || "30", 10)),
      shuffle: document.getElementById("sShuffle").value === "1",
      start_at: start ? new Date(start).toISOString() : null,
      end_at: end ? new Date(end).toISOString() : null,
      note: document.getElementById("sNote").value.trim(),
      updated_at: new Date().toISOString()
    };
    if (patch.start_at && patch.end_at && new Date(patch.end_at) <= new Date(patch.start_at)) {
      throw new Error("截止时间必须晚于开放时间");
    }
    return patch;
  }

  async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById("saveSetting");
    try {
      const patch = readSettingForm();
      btn.disabled = true;
      const { error } = await API.sb.from("exam_settings").update(patch).eq("id", 1);
      if (error) throw error;
      await loadSettings(); renderSettings(); loadOverview();
      API.toast("设置已保存", "success");
    } catch (err) {
      API.toast("保存失败：" + (err.message || err), "error", 3600);
    } finally {
      btn.disabled = false;
    }
  }

  async function quickToggle(open) {
    try {
      const { error } = await API.sb.from("exam_settings")
        .update({ is_open: open, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      await loadSettings(); renderSettings(); loadOverview();
      API.toast(open ? "答题入口已开放" : "答题入口已关闭", "success");
    } catch (err) {
      API.toast("操作失败：" + (err.message || err), "error");
    }
  }

  /* ---------------- 成绩 ---------------- */
  async function loadAttempts() {
    const { data, error } = await API.sb
      .from("attempts")
      .select("id, full_name, student_no, department, class_name, score, total_score, correct_count, question_count, duration_seconds, status, submitted_at, started_at")
      .order("score", { ascending: false });
    if (error) throw error;
    S.attempts = data || [];
  }

  function renderScores() {
    const kw = (document.getElementById("scoreSearch").value || "").trim().toLowerCase();
    const status = document.getElementById("scoreStatus").value;
    const list = S.attempts.filter((a) => {
      const hitKw = !kw || [a.full_name, a.student_no, a.class_name, a.department].join(" ").toLowerCase().includes(kw);
      const hitStatus = !status || a.status === status;
      return hitKw && hitStatus;
    }).sort((a, b) => Number(b.score) - Number(a.score));

    document.getElementById("scoreCount").textContent =
      `共 ${list.length} 条 / 已交卷 ${S.attempts.filter((a) => a.status === "submitted").length} 人`;

    document.getElementById("scoreBody").innerHTML = list.length
      ? list.map((a, i) => `<tr>
          <td class="mono">${a.status === "submitted" ? i + 1 : "—"}</td>
          <td>${API.escapeHtml(a.full_name || "—")}</td>
          <td class="mono">${API.escapeHtml(a.student_no || "—")}</td>
          <td>${API.escapeHtml(a.department || "—")}</td>
          <td>${API.escapeHtml(a.class_name || "—")}</td>
          <td class="mono" style="font-weight:700;color:${a.status === "submitted" ? "var(--blue-700)" : "var(--ink-3)"}">${a.status === "submitted" ? a.score : "—"}</td>
          <td class="mono muted">${a.total_score}</td>
          <td class="mono muted">${a.correct_count} / ${a.question_count}</td>
          <td class="mono muted">${Math.floor((a.duration_seconds || 0) / 60)} 分 ${(a.duration_seconds || 0) % 60} 秒</td>
          <td class="muted">${a.status === "submitted" ? API.fmtTime(a.submitted_at) : "未交卷"}</td>
        </tr>`).join("")
      : `<tr><td colspan="10"><div class="empty-state" style="padding:24px">暂无答题记录</div></td></tr>`;
  }

  function exportScores() {
    const submitted = S.attempts.filter((a) => a.status === "submitted").sort((a, b) => Number(b.score) - Number(a.score));
    if (!submitted.length) return API.toast("暂无已交卷成绩可导出", "error");
    const rows = [["排名", "姓名", "学号", "系部", "班级", "得分", "总分", "正确题数", "题目数", "正确率", "用时（秒）", "交卷时间"]];
    submitted.forEach((a, i) => rows.push([
      i + 1, a.full_name, a.student_no, a.department, a.class_name,
      a.score, a.total_score, a.correct_count, a.question_count,
      a.total_score > 0 ? Math.round((a.score / a.total_score) * 100) + "%" : "0%",
      a.duration_seconds, API.fmtTime(a.submitted_at)
    ]));
    API.downloadCSV(`答题成绩_${dateStamp()}.csv`, rows);
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(title, bodyHtml, onConfirm, confirmText) {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${API.escapeHtml(title)}</h3><button class="close" type="button">×</button></div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">
          <button class="btn ghost" data-cancel type="button">取消</button>
          ${onConfirm ? `<button class="btn" data-ok type="button">${API.escapeHtml(confirmText || "保存")}</button>` : ""}
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector(".close").onclick = close;
    mask.querySelector("[data-cancel]").onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };

    const ok = mask.querySelector("[data-ok]");
    if (ok) {
      ok.onclick = async () => {
        ok.disabled = true;
        try {
          await onConfirm();
          close();
        } catch (err) {
          API.toast(String(err.message || err), "error", 3600);
          ok.disabled = false;
        }
      };
    }
    return mask;
  }

  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}${API.pad(d.getMonth() + 1)}${API.pad(d.getDate())}_${API.pad(d.getHours())}${API.pad(d.getMinutes())}`;
  }
})();
