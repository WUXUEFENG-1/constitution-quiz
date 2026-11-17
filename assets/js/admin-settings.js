/* 系统设置 + 系统日志 */
(function () {
  Admin.register("settings", { loadSettings });
  Admin.register("logs", { loadLogs });

  async function loadSettings() {
    await API.loadSettings(true);
    const site = API.getSetting("site", {});
    const sec = API.getSetting("security", {});
    const ds = API.getSetting("deepseek", {});

    document.getElementById("setSiteTitle").value = site.title || "";
    document.getElementById("setSiteSub").value = site.subtitle || "";
    document.getElementById("setCaptcha").value = sec.captcha === false ? "false" : "true";
    document.getElementById("setMaxSwitch").value = sec.max_switch || 3;
    const carousel = API.getSetting("carousel", []);
    const car0 = Array.isArray(carousel) && carousel[0] ? carousel[0] : {};
    document.getElementById("setCarTitle").value = car0.title || "";
    document.getElementById("setCarDesc").value = car0.desc || "";
    document.getElementById("setDsBase").value = ds.api_base || "https://api.deepseek.com";
    document.getElementById("setDsModel").value = ds.model || "deepseek-chat";
    document.getElementById("setDsKey").value = ds.api_key || "";

    document.getElementById("setSaveSite").onclick = saveSite;
    document.getElementById("setSaveDs").onclick = saveDs;
  }

  async function saveSite() {
    await API.saveSetting("site", {
      title: document.getElementById("setSiteTitle").value.trim(),
      subtitle: document.getElementById("setSiteSub").value.trim()
    });
    await API.saveSetting("security", {
      captcha: document.getElementById("setCaptcha").value === "true",
      max_switch: Number(document.getElementById("setMaxSwitch").value) || 3,
      switch_warn: true
    });
    const carTitle = document.getElementById("setCarTitle").value.trim();
    if (carTitle) {
      await API.saveSetting("carousel", [{ title: carTitle, desc: document.getElementById("setCarDesc").value.trim() }]);
    }
    API.toast("页面与安全配置已保存", "success");
  }

  async function saveDs() {
    await API.saveSetting("deepseek", {
      api_base: document.getElementById("setDsBase").value.trim() || "https://api.deepseek.com",
      model: document.getElementById("setDsModel").value.trim() || "deepseek-chat",
      api_key: document.getElementById("setDsKey").value.trim()
    });
    API.toast("DeepSeek 配置已保存", "success");
  }

  async function loadLogs() {
    const { data } = await API.sb.from("audit_logs")
      .select("*").order("created_at", { ascending: false }).limit(200);
    const body = document.getElementById("logBody");
    const rows = data || [];
    if (!rows.length) { body.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center">暂无日志</td></tr>'; return; }
    body.innerHTML = rows.map((l) => `<tr>
      <td>${API.fmtTime(l.created_at)}</td>
      <td>${API.roleLabel(l.role)}<div class="muted mono" style="font-size:12px">${API.escapeHtml((l.user_id || "").slice(0, 8))}</div></td>
      <td>${API.escapeHtml(l.action)}</td>
      <td>${API.escapeHtml(l.detail)}</td>
    </tr>`).join("");
  }
})();
