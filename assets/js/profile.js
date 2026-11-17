/* 个人中心：信息、改密、历史成绩、证书 */
(function () {
  let profile = null, certTemplate = {}, certs = [];

  init();

  async function init() {
    try { const ctx = await API.guard("contestant"); profile = ctx.profile; } catch (e) { return; }
    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();
    await API.loadSettings();
    certTemplate = API.getSetting("cert_template", {});

    bindTabs();
    fillInfo();
    bindInfo();
    bindPwd();
    await loadHistory();
    await loadCerts();
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        ["info", "password", "history", "certs"].forEach((k) => {
          document.getElementById("panel-" + k).hidden = k !== t.dataset.tab;
        });
      };
    });
  }

  function fillInfo() {
    document.getElementById("pName").value = profile.full_name || "";
    document.getElementById("pNo").value = profile.student_no || "";
    document.getElementById("pDept").value = profile.department || "";
    document.getElementById("pClass").value = profile.class_name || "";
    document.getElementById("pPhone").value = profile.phone || "";
  }

  function bindInfo() {
    document.getElementById("infoForm").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await API.sb.from("profiles").update({
        department: document.getElementById("pDept").value.trim(),
        class_name: document.getElementById("pClass").value.trim(),
        phone: document.getElementById("pPhone").value.trim()
      }).eq("id", profile.id);
      if (error) return API.toast("保存失败：" + error.message, "error");
      API.toast("信息已保存", "success");
      Object.assign(profile, {
        department: document.getElementById("pDept").value.trim(),
        class_name: document.getElementById("pClass").value.trim(),
        phone: document.getElementById("pPhone").value.trim()
      });
    };
  }

  function bindPwd() {
    document.getElementById("pwdForm").onsubmit = async (e) => {
      e.preventDefault();
      const oldPwd = document.getElementById("oldPwd").value;
      const n1 = document.getElementById("newPwd").value;
      const n2 = document.getElementById("newPwd2").value;
      if (n1.length < 6) return API.toast("新密码至少 6 位", "error");
      if (n1 !== n2) return API.toast("两次输入的新密码不一致", "error");
      try {
        await API.changePassword(oldPwd, n1);
        API.toast("密码修改成功，下次登录请使用新密码", "success");
        document.getElementById("pwdForm").reset();
      } catch (err) {
        API.toast("修改失败：" + (err.message || err), "error", 3600);
      }
    };
  }

  async function loadHistory() {
    const { data } = await API.sb.from("attempts")
      .select("*").eq("user_id", profile.id)
      .order("submitted_at", { ascending: false, nullsFirst: false });
    const comps = await API.sb.from("competitions").select("id,title");
    const compMap = Object.fromEntries((comps.data || []).map((c) => [c.id, c.title]));
    const rows = (data || []).filter((a) => a.status === "submitted");
    const body = document.getElementById("historyBody");
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">暂无答题记录</td></tr>'; return; }
    body.innerHTML = rows.map((a) => {
      const pct = a.total_score > 0 ? Math.round((a.score / a.total_score) * 100) : 0;
      return `<tr>
        <td>${API.escapeHtml(compMap[a.competition_id] || "校园知识竞赛")}</td>
        <td class="mono"><b>${a.score}</b></td><td>${a.total_score}</td>
        <td>${a.correct_count}/${a.question_count}</td><td>${pct}%</td>
        <td>${Math.floor((a.duration_seconds || 0) / 60)}分${(a.duration_seconds || 0) % 60}秒</td>
        <td>${API.fmtTime(a.submitted_at)}</td>
        <td><a class="link-btn" href="result.html?id=${a.id}">查看解析</a></td>
      </tr>`;
    }).join("");
  }

  async function loadCerts() {
    const { data } = await API.sb.from("certificates")
      .select("*").eq("user_id", profile.id).order("issued_at", { ascending: false });
    certs = data || [];
    const box = document.getElementById("certList");
    if (!certs.length) { box.innerHTML = '<div class="empty-state" style="padding:20px">赛后由组委会核发证书后可在此查看</div>'; return; }
    box.innerHTML = certs.map((c, i) => `
      <div class="cert-box" style="margin-bottom:20px" id="cert-${i}">
        <div class="cert-org">${API.escapeHtml(certTemplate.org || API.cfg.ORG_NAME)}</div>
        <div class="cert-title">${API.escapeHtml(certTemplate.title || "参赛证书")}</div>
        <div class="cert-line">兹证明</div>
        <div class="cert-name">${API.escapeHtml(profile.full_name)}</div>
        <div class="cert-line">在${API.escapeHtml(API.cfg.EVENT_NAME)}中荣获成绩 <b>${c.score}</b> 分${c.rank_no ? `，排名第 ${c.rank_no} 名` : ""}</div>
        <div class="cert-foot"><span>证书编号：${API.escapeHtml(c.serial_no)}</span><span>${API.fmtTime(c.issued_at)}</span></div>
      </div>
      <div class="btn-row" style="justify-content:center;margin-bottom:24px">
        <button class="btn soft sm" data-dl="${i}">下载证书图片</button>
      </div>`).join("");
    box.querySelectorAll("[data-dl]").forEach((b) => b.onclick = () => drawCert(Number(b.dataset.dl)));
  }

  function drawCert(i) {
    const c = certs[i];
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1200, 800);
    ctx.strokeStyle = "#1d6fb9"; ctx.lineWidth = 12; ctx.strokeRect(28, 28, 1144, 744);
    ctx.strokeStyle = "#bcd7f0"; ctx.lineWidth = 3; ctx.strokeRect(48, 48, 1104, 704);
    ctx.textAlign = "center";
    ctx.fillStyle = "#7b8a99"; ctx.font = "26px sans-serif";
    ctx.fillText(certTemplate.org || API.cfg.ORG_NAME, 600, 130);
    ctx.fillStyle = "#0b3a67"; ctx.font = "bold 54px sans-serif";
    ctx.fillText(certTemplate.title || "参赛证书", 600, 230);
    ctx.fillStyle = "#4a5b6c"; ctx.font = "28px sans-serif";
    ctx.fillText("兹证明", 600, 320);
    ctx.fillStyle = "#1c2b3a"; ctx.font = "bold 44px sans-serif";
    ctx.fillText(profile.full_name, 600, 390);
    ctx.fillStyle = "#4a5b6c"; ctx.font = "26px sans-serif";
    ctx.fillText(`在${API.cfg.EVENT_NAME}中荣获成绩 ${c.score} 分${c.rank_no ? `，排名第 ${c.rank_no} 名` : ""}`, 600, 470);
    ctx.fillStyle = "#7b8a99"; ctx.font = "22px sans-serif";
    ctx.fillText(`证书编号：${c.serial_no}`, 300, 660);
    ctx.fillText(API.fmtTime(c.issued_at), 900, 660);
    const a = document.createElement("a");
    a.download = `证书_${profile.student_no}_${c.serial_no}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
})();
