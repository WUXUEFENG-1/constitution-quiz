/* ============================================================
 * 公共层：Supabase 初始化、登录态、通用工具
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

  const API = {
    cfg,
    configured,
    sb,

    /* 学号 → 登录邮箱 */
    toEmail(account) {
      return String(account || "").trim().toLowerCase() + "@" + (cfg.DOMAIN_SUFFIX || "xfjs.local");
    },

    /* 未配置 Supabase 时，页面顶部提示 */
    configWarning() {
      if (configured) return;
      const bar = document.createElement("div");
      bar.className = "config-bar";
      bar.innerHTML =
        '系统尚未连接数据库：请编辑 <code>assets/js/config.js</code>，填入 Supabase 的 ' +
        "<b>SUPABASE_URL</b> 与 <b>SUPABASE_ANON_KEY</b> 后重新部署。";
      document.body.prepend(bar);
    },

    /* 顶部品牌信息 */
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
        .select("id, full_name, student_no, department, class_name, phone, role")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data || { id: user.id, role: "contestant", full_name: "", student_no: "" };
    },

    /* 页面守卫：role = "contestant" | "admin" | null */
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
        location.replace("index.html?redirect=" + encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html"));
        throw new Error("no-session");
      }
      const profile = await API.getProfile();
      if (role === "admin" && profile.role !== "admin") {
        location.replace("dashboard.html");
        throw new Error("not-admin");
      }
      if (role === "contestant" && profile.role === "admin") {
        location.replace("admin.html");
        throw new Error("is-admin");
      }
      API.applyBrand();
      return { user, profile };
    },

    async signOut() {
      if (sb) await sb.auth.signOut();
      location.replace("index.html");
    },

    /* ---------- 通用 UI ---------- */
    toast(message, type = "info", ms = 2600) {
      let box = document.querySelector(".toast-box");
      if (!box) {
        box = document.createElement("div");
        box.className = "toast-box";
        document.body.appendChild(box);
      }
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

    fmtSeconds(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return (h > 0 ? API.pad(h) + ":" : "") + API.pad(m) + ":" + API.pad(s);
    },

    /* CSV 导出（Excel 可直接打开，带 BOM 防中文乱码） */
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

    /* 题型中文名 */
    typeLabel(t) {
      return ({ single: "单选题", multiple: "多选题", judge: "判断题", fill: "填空题" })[t] || t;
    },

    /* 选项字母 */
    letters: ["A", "B", "C", "D", "E", "F"],

    /* 把答案数组格式化成可读文本 */
    answerText(qtype, answer) {
      const arr = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
      if (!arr.length) return "（未作答）";
      if (qtype === "judge") return arr[0] === "A" ? "正确" : "错误";
      if (qtype === "fill") return arr.join(" / ");
      return arr.join("");
    }
  };

  global.API = API;

  document.addEventListener("DOMContentLoaded", () => {
    API.applyBrand();
  });
})(window);
