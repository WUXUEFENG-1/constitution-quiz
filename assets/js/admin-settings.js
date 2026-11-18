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

  let lastLogs = [];

  async function loadLogs() {
    const body = document.getElementById("logBody");
    const count = document.getElementById("logCount");
    const refresh = document.getElementById("logRefresh");
    const exportBtn = document.getElementById("logExport");
    const clearBtn = document.getElementById("logClear");
    if (refresh) refresh.onclick = loadLogs;
    if (exportBtn) exportBtn.onclick = exportLogs;
    if (clearBtn) clearBtn.onclick = clearLogs;

    const fail = (msg) => {
      console.error("loadLogs:", msg);
      if (body) body.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center">加载失败：${API.escapeHtml(msg)}</td></tr>`;
    };

    try {
      const { data, error } = await API.sb.rpc("admin_list_logs");
      if (error) throw new Error(error.message || "未知错误");
      const rows = Array.isArray(data) ? data : [];
      const pMap = await API.profileMap(rows.map((l) => l.user_id));
      lastLogs = rows;
      if (count) count.textContent = `共 ${rows.length} 条`;
      if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center">暂无日志</td></tr>'; return; }
      body.innerHTML = rows.map((l) => {
        const p = pMap[l.user_id] || {};
        const name = p.full_name || API.roleLabel(l.role) || "—";
        return `<tr>
          <td>${API.fmtTime(l.created_at)}</td>
          <td>${API.escapeHtml(name)}<div class="muted mono" style="font-size:12px">${API.escapeHtml(API.roleLabel(l.role))} · ${API.escapeHtml((l.user_id || "").slice(0, 8))}</div></td>
          <td>${API.escapeHtml(l.action)}</td>
          <td>${API.escapeHtml(l.detail)}</td>
          <td><button class="link-btn danger" data-log-del="${l.id}">删除</button></td>
        </tr>`;
      }).join("");
      body.querySelectorAll("[data-log-del]").forEach((b) => b.onclick = async () => {
        if (!await API.confirm("确认删除这条日志？")) return;
        const { error: e } = await API.sb.rpc("admin_delete_log", { p_id: Number(b.dataset.logDel) });
        if (e) return API.toast("删除失败：" + e.message, "error");
        API.toast("已删除", "success"); loadLogs();
      });
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }

  function exportLogs() {
    if (!lastLogs.length) return API.toast("暂无可导出的日志", "error");
    const header = ["时间", "账号/角色", "操作", "详情"];
    const lines = lastLogs.map((l) => [
      API.fmtTime(l.created_at),
      `${API.roleLabel(l.role)} ${(l.user_id || "").slice(0, 8)}`,
      l.action || "",
      l.detail || ""
    ]);
    API.downloadCSV(`操作日志_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines]);
  }

  async function clearLogs() {
    if (!await API.confirm("确认清空全部日志？此操作不可恢复。")) return;
    const { error } = await API.sb.rpc("admin_clear_logs");
    if (error) return API.toast("清空失败：" + error.message, "error");
    API.toast("日志已清空", "success"); loadLogs();
  }
})();
