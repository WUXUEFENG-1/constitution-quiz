/* ============================================================
 * 公共层：Supabase 初始化、登录态、验证码、改密、设置、通用工具
 * ============================================================ */
(function (global) {
  const cfg = global.APP_CONFIG || {};
  const configured =
    typeof cfg.SUPABASE_URL === "string" &&
    /^https:\/\//.test(cfg.SUPABASE_URL) &&
    !/YOUR-/.test(cfg.SUPABASE_URL) &&
    typeof cfg.SUPABASE_ANON_KEY === "string" &&
    cfg.SUPABASE_ANON_KEY.length > 40 &&
    !/YOUR-/.test(cfg.SUPABASE_ANON_KEY);

  let sb = null;
  if (configured && global.supabase && global.supabase.createClient) {
    sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }

  const ROLE_LABELS = {
    contestant: "选手", admin: "系统管理员", sub_admin: "子管理员",
    questioner: "出题员", proctor: "监考员", statistician: "统计员"
  };
  const STAFF_ROLES = ["admin", "sub_admin", "questioner", "proctor", "statistician"];
  let settingsCache = null;

  const API = {
    cfg,
    configured,
    sb,
    ROLE_LABELS,
    STAFF_ROLES,

    toEmail(account) {
      return String(account || "").trim().toLowerCase() + "@" + (cfg.DOMAIN_SUFFIX || "xfjs.local");
    },

    configWarning() {
      if (configured) return;
      const bar = document.createElement("div");
      bar.className = "config-bar";
      bar.innerHTML =
        '系统尚未连接数据库：请编辑 <code>assets/js/config.js</code>，填入 Supabase 的 ' +
        "<b>SUPABASE_URL</b> 与 <b>SUPABASE_ANON_KEY</b> 后重新部署。";
      document.body.prepend(bar);
    },

    applyBrand(root) {
      const scope = root || document;
      scope.querySelectorAll("[data-brand]").forEach((el) => {
        const key = el.getAttribute("data-brand");
        if (cfg[key]) el.textContent = cfg[key];
      });
      const t = scope.querySelector("title[data-brand]");
      if (t) t.textContent = cfg[t.getAttribute("data-brand")];
    },

    /* ---------- 登录态 ---------- */
    async getSession() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data.session || null;
    },

    async currentUser() {
      const s = await API.getSession();
      return s ? s.user : null;
    },

    async getProfile() {
      if (!sb) return null;
      const user = await API.currentUser();
      if (!user) return null;
      const { data, error } = await sb
        .from("profiles")
        .select("id, full_name, student_no, department, class_name, phone, role, status, ban_reason")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data || { id: user.id, role: "contestant", full_name: "", student_no: "", status: "active", __missing: true };
    },

    roleLabel(r) { return ROLE_LABELS[r] || r || "选手"; },
    isStaff(role) { return STAFF_ROLES.includes(role); },
    isAdminRole(role) { return role === "admin" || role === "sub_admin"; },

    /* 页面守卫：role = contestant | staff | admin */
    async guard(role) {
      API.configWarning();
      if (!sb) {
        document.body.innerHTML =
          '<div class="empty-state"><h2>尚未配置数据库</h2><p>请先填写 assets/js/config.js 中的 Supabase 参数。</p>' +
          '<p><a class="btn" href="index.html">返回登录</a></p></div>';
        throw new Error("not-configured");
      }
      const user = await API.currentUser();
      if (!user) {
        location.replace("index.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() || "home.html"));
        throw new Error("no-session");
      }
      const profile = await API.getProfile();
      if (profile.status === "banned") {
        await API.signOut(true);
        throw new Error("banned");
      }
      if (role === "admin" && !API.isAdminRole(profile.role)) {
        location.replace(API.isStaff(profile.role) ? "admin.html" : "home.html");
        throw new Error("not-admin");
      }
      if (role === "staff" && !API.isStaff(profile.role)) {
        if (profile.__missing) {
          location.replace("index.html?redirect=admin.html");
          throw new Error("no-profile");
        }
        location.replace("home.html");
        throw new Error("not-staff");
      }
      if (role === "contestant" && API.isStaff(profile.role)) {
        const preview = new URLSearchParams(location.search).get("view") === "contestant";
        if (!preview) { location.replace("admin.html"); throw new Error("is-staff"); }
      }
      API.applyBrand();
      return { user, profile };
    },

    async signOut(skipRedirect) {
      if (sb) await sb.auth.signOut();
      if (!skipRedirect) location.replace("index.html");
    },

    /* ---------- 改密 ---------- */
    async changePassword(oldPwd, newPwd) {
      const user = await API.currentUser();
      if (!user) throw new Error("请先登录");
      const email = user.email || API.toEmail("");
      const { error: vErr } = await sb.auth.signInWithPassword({ email, password: oldPwd });
      if (vErr) throw new Error("原密码不正确");
      const { error } = await sb.auth.updateUser({ password: newPwd });
      if (error) throw error;
      await API.logAction("修改密码", "");
    },

    /* ---------- 审计 / 作弊 ---------- */
    async logAction(action, detail) {
      try { await sb.rpc("log_action", { p_action: action, p_detail: detail || "" }); } catch (e) {}
    },
    async recordCheat(kind, detail) {
      try { await sb.rpc("record_cheat", { p_kind: kind, p_detail: detail || "" }); } catch (e) {}
    },

    /* ---------- 系统设置 ---------- */
    async loadSettings(force) {
      if (settingsCache && !force) return settingsCache;
      settingsCache = {};
      if (!sb) return settingsCache;
      const { data } = await sb.from("app_settings").select("key,value");
      (data || []).forEach((r) => { settingsCache[r.key] = r.value; });
      return settingsCache;
    },
    getSetting(key, fallback) {
      const v = settingsCache && settingsCache[key];
      return v == null ? fallback : v;
    },
    async saveSetting(key, value) {
      const { error } = await sb.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      settingsCache = settingsCache || {};
      settingsCache[key] = value;
    },

    /* ---------- 图形验证码（前端会话校验，防误触与弱机器人） ---------- */
    newCaptcha(canvas) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      sessionStorage.setItem("xfjs_captcha", code);
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = "#f4f7fb"; ctx.fillRect(0, 0, w, h);
        ctx.font = "bold 20px monospace"; ctx.textBaseline = "middle";
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = ["#0c2a4d", "#c8102e", "#1d5386", "#b98100"][i % 4];
          ctx.fillText(code[i], 14 + i * 22, h / 2 + (Math.random() * 4 - 2));
        }
        ctx.strokeStyle = "rgba(12,42,77,.35)";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * w, Math.random() * h);
          ctx.lineTo(Math.random() * w, Math.random() * h);
          ctx.stroke();
        }
      }
      return code;
    },
    checkCaptcha(input) {
      const expect = sessionStorage.getItem("xfjs_captcha") || "";
      const ok = expect && String(input || "").trim().toUpperCase() === expect;
      sessionStorage.removeItem("xfjs_captcha");
      return ok;
    },

    /* ---------- DeepSeek 解析 ---------- */
    async deepseekParse(rawText, taskHint) {
      const set = API.getSetting("deepseek", {});
      const key = (set && set.api_key) || "";
      const base = (set && set.api_base) || "https://api.deepseek.com";
      const model = (set && set.model) || "deepseek-chat";
      if (!key) throw new Error("尚未配置 DeepSeek API Key（管理员在系统设置中填写）");
      const sys = "你是题库解析助手。把输入文本解析为结构化题目 JSON，只输出 JSON 对象，格式 {\"questions\":[...]}，不要解释、不要代码块。" +
        "每项字段：qtype(single/multiple/judge/fill), content(题干), options(字符串数组，判断题固定['正确','错误']), " +
        "answer(数组：单选/判断填['A'/'B']，多选填字母数组，填空填空位答案数组), score(数字), analysis(解析)。" + taskHint;
      const resp = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model, temperature: 0.1, max_tokens: 8192, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: rawText.slice(0, 12000) }
          ]
        })
      });
      if (!resp.ok) throw new Error("DeepSeek 请求失败：HTTP " + resp.status);
      const j = await resp.json();
      const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "{}";
      const parsed = API.looseJson(text);
      const list = parsed.questions || parsed.items || (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(list)) throw new Error("解析结果格式不正确");
      return list;
    },

    /* 容错解析：去代码围栏、截断时补齐括号与引号 */
    looseJson(text) {
      let s = String(text || "").trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const start = s.search(/[[{]/);
      if (start < 0) throw new Error("解析结果中未找到 JSON");
      s = s.slice(start);
      try { return JSON.parse(s); } catch (e) { /* 继续修复 */ }
      let out = "", stack = [], inStr = false, esc = false;
      for (const ch of s) {
        out += ch;
        if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
        else if (ch === "}" || ch === "]") stack.pop();
      }
      if (inStr) out += '"';
      out = out.replace(/,\s*([}\]])/g, "$1");
      while (stack.length) out += stack.pop();
      return JSON.parse(out);
    },

    /* ---------- 通用 UI ---------- */
    toast(message, type = "info", ms = 2600) {
      let box = document.querySelector(".toast-box");
      if (!box) { box = document.createElement("div"); box.className = "toast-box"; document.body.appendChild(box); }
      const item = document.createElement("div");
      item.className = "toast toast-" + type;
      item.textContent = message;
      box.appendChild(item);
      setTimeout(() => item.classList.add("out"), ms - 300);
      setTimeout(() => item.remove(), ms);
    },

    escapeHtml(str) {
      return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    },

    /* 自定义确认弹窗：替代浏览器原生 confirm（原生标题固定为域名，无法自定义）。
       返回 Promise<boolean>，确定为 true、取消/点遮罩为 false。 */
    confirm(message, title) {
      return new Promise((resolve) => {
        const mask = document.createElement("div");
        mask.className = "modal-mask";
        mask.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true" style="width:min(420px,100%)">
            <div class="modal-head"><h3>${API.escapeHtml(title || "云南工业信息职业学院学生青年成长社提示")}</h3></div>
            <div class="modal-body"><p style="margin:6px 0;line-height:1.7;color:var(--ink-2)">${API.escapeHtml(message)}</p></div>
            <div class="modal-foot">
              <button type="button" class="btn ghost" data-ccancel>取消</button>
              <button type="button" class="btn" data-cok>确定</button>
            </div>
          </div>`;
        const done = (v) => { mask.remove(); resolve(v); };
        mask.querySelector("[data-cok]").onclick = () => done(true);
        mask.querySelector("[data-ccancel]").onclick = () => done(false);
        mask.onclick = (e) => { if (e.target === mask) done(false); };
        document.body.appendChild(mask);
      });
    },

    /* 转义后保留换行：规则等多行文本发布后按原分行展示 */
    renderMultiline(text) {
      return API.escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>");
    },

    /* 规则专用：先保留已有换行，再把连写的“编号条目（1. 2. 3.…）”拆成独立一行 */
    renderRules(text) {
      const raw = String(text == null ? "" : text);
      const parts = raw.split(/\r\n|\r|\n/);
      const out = [];
      parts.forEach((part) => {
        const segs = part.split(/(?=(?:^|\s)\d{1,2}\.\s)/);
        segs.forEach((seg) => {
          const t = API.escapeHtml(seg.trim());
          if (t) out.push(t);
        });
      });
      return out.join("<br>");
    },

    deptOptions(selected) {
      const list = Array.isArray(cfg.DEPARTMENTS) && cfg.DEPARTMENTS.length
        ? cfg.DEPARTMENTS : [];
      const sel = String(selected || "").trim();
      const opts = list.map((d) =>
        `<option value="${API.escapeHtml(d)}"${d === sel ? " selected" : ""}>${API.escapeHtml(d)}</option>`
      );
      if (sel && !list.includes(sel)) {
        opts.unshift(`<option value="${API.escapeHtml(sel)}" selected>${API.escapeHtml(sel)}</option>`);
      }
      return `<option value="">请选择学院</option>` + opts.join("");
    },

    pad(n) { return String(n).padStart(2, "0"); },

    fmtTime(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d)) return "—";
      return `${d.getFullYear()}-${API.pad(d.getMonth() + 1)}-${API.pad(d.getDate())} ${API.pad(d.getHours())}:${API.pad(d.getMinutes())}`;
    },

    toLocalInput(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d)) return "";
      return `${d.getFullYear()}-${API.pad(d.getMonth() + 1)}-${API.pad(d.getDate())}T${API.pad(d.getHours())}:${API.pad(d.getMinutes())}`;
    },

    /* datetime-local 本地时间字符串 → UTC ISO 时间戳，避免被数据库按 UTC 误存导致 +8 小时 */
    localToISO(str) {
      if (!str) return null;
      const d = new Date(str);
      return isNaN(d) ? null : d.toISOString();
    },

    fmtSeconds(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return (h > 0 ? API.pad(h) + ":" : "") + API.pad(m) + ":" + API.pad(s);
    },

    downloadCSV(filename, rows) {
      const esc = (v) => {
        const s = String(v == null ? "" : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    },

    typeLabel(t) {
      return ({ single: "单选题", multiple: "多选题", judge: "判断题", fill: "填空题" })[t] || t;
    },

    letters: ["A", "B", "C", "D", "E", "F"],

    answerText(qtype, answer) {
      const arr = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
      if (!arr.length) return "（未作答）";
      if (qtype === "judge") return arr[0] === "A" ? "正确" : "错误";
      if (qtype === "fill") return arr.join(" / ");
      return arr.join("");
    },

    initial(name) { return String(name || "?").trim().charAt(0).toUpperCase(); },

    /* ---------- 文件解析：表格（xlsx/csv）与文本文档（docx/pdf） ---------- */
    async parseTableFile(file) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext === "docx" || ext === "pdf") return [];
      const buf = await file.arrayBuffer();
      let wb;
      if (ext === "csv") {
        let text;
        try { text = new TextDecoder("utf-8").decode(buf); }
        catch (e) { text = new TextDecoder("gb18030").decode(buf); }
        wb = XLSX.read(text, { type: "string" });
      } else {
        wb = XLSX.read(buf, { type: "array" });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) return [];
      // 自动定位表头行：跳过顶部标题横幅/空行，找到含“题型/题干”的那一行
      let headIdx = rows.findIndex((r) =>
        r.some((c) => ["题型", "题目类型", "类型"].includes(String(c).trim())) &&
        r.some((c) => ["题干", "题目", "题面", "题干内容"].includes(String(c).trim())));
      if (headIdx < 0) headIdx = 0;
      const headers = rows[headIdx].map((h) => String(h).trim());
      return rows.slice(headIdx + 1).filter((r) => r.some((c) => String(c).trim() !== ""))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    },

    async extractDocText(file) {
      const ext = file.name.split(".").pop().toLowerCase();
      const buf = await file.arrayBuffer();
      if (ext === "docx") {
        if (typeof mammoth === "undefined") throw new Error("Word 解析库未加载");
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        return res.value || "";
      }
      if (ext === "pdf") {
        if (typeof pdfjsLib === "undefined") throw new Error("PDF 解析库未加载");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let out = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          out += tc.items.map((it) => it.str).join(" ") + "\n";
        }
        return out;
      }
      return new TextDecoder("utf-8").decode(buf);
    }
  };

  global.API = API;

  document.addEventListener("DOMContentLoaded", () => { API.applyBrand(); });
})(window);
