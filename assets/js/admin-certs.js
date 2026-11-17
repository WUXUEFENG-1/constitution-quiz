/* 证书管理：模板配置 + 批量签发 */
(function () {
  let certs = [], certImage = "";

  Admin.register("certs", { load });

  async function load() {
    await loadTemplate();
    const { data } = await API.sb.from("certificates")
      .select("*,profiles(full_name,student_no)")
      .order("issued_at", { ascending: false });
    certs = data || [];
    document.getElementById("certSaveTpl").onclick = saveTemplate;
    document.getElementById("certIssueBtn").onclick = batchIssue;
    document.getElementById("certRefresh").onclick = load;
    document.getElementById("certImg").onchange = onPickImg;
    ["certTitle", "certOrg", "certFoot"].forEach((id) => {
      document.getElementById(id).oninput = updatePreview;
    });
    updatePreview();
    render();
  }

  async function loadTemplate() {
    const tpl = API.getSetting("cert_template", {});
    certImage = tpl.image || "";
    document.getElementById("certTitle").value = tpl.title || "参赛证书";
    document.getElementById("certOrg").value = tpl.org || API.cfg.ORG_NAME;
    document.getElementById("certFoot").value = tpl.footer || "";
    const prev = document.getElementById("certImgPreview");
    if (certImage) { prev.src = certImage; prev.hidden = false; } else { prev.hidden = true; }
  }

  function updatePreview() {
    const title = document.getElementById("certTitle").value.trim() || "参赛证书";
    const org = document.getElementById("certOrg").value.trim();
    const foot = document.getElementById("certFoot").value.trim();
    document.getElementById("pvTitle").textContent = title;
    document.getElementById("pvOrg").textContent = org;
    document.getElementById("pvFoot").textContent = foot;
    document.getElementById("pvDate").textContent = API.fmtTime(new Date().toISOString()).slice(0, 10);
    const box = document.getElementById("certPreview");
    if (certImage) {
      box.style.backgroundImage = `url(${certImage})`;
      box.style.color = "#fff";
    } else {
      box.style.backgroundImage = "";
      box.style.color = "";
    }
  }

  function onPickImg(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { API.toast("模板图请控制在 2MB 以内", "error"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        certImage = canvas.toDataURL("image/jpeg", 0.8);
        const prev = document.getElementById("certImgPreview");
        prev.src = certImage; prev.hidden = false;
        updatePreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function saveTemplate() {
    const tpl = {
      title: document.getElementById("certTitle").value.trim(),
      org: document.getElementById("certOrg").value.trim(),
      footer: document.getElementById("certFoot").value.trim(),
      image: certImage
    };
    await API.saveSetting("cert_template", tpl);
    API.toast("证书模板已保存", "success");
  }

  function render() {
    document.getElementById("certCount").textContent = `共 ${certs.length} 张`;
    const body = document.getElementById("certBody");
    if (!certs.length) { body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center">暂无已发证书</td></tr>'; return; }
    body.innerHTML = certs.map((c) => {
      const p = c.profiles || {};
      return `<tr>
        <td>${API.escapeHtml(p.full_name || "—")}</td>
        <td class="mono">${API.escapeHtml(p.student_no || "—")}</td>
        <td class="mono">${API.escapeHtml(c.serial_no)}</td>
        <td>${c.score}</td>
        <td>${c.rank_no ? "第 " + c.rank_no + " 名" : "—"}</td>
        <td>${API.fmtTime(c.issued_at)}</td>
      </tr>`;
    }).join("");
  }

  async function batchIssue() {
    const { data: attempts } = await API.sb.from("attempts")
      .select("id,user_id,competition_id,score,total_score")
      .eq("status", "submitted")
      .order("score", { ascending: false, nullsFirst: false });
    const rows = attempts || [];
    if (!rows.length) return API.toast("暂无可签发证书的已交卷成绩", "error");
    if (!confirm(`将为 ${rows.length} 名已交卷选手批量签发证书，是否继续？`)) return;
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const { error } = await API.sb.rpc("issue_certificate", {
        p_user_id: a.user_id, p_competition_id: a.competition_id, p_attempt_id: a.id,
        p_score: a.score, p_rank: i + 1
      });
      if (error) fail++; else ok++;
    }
    API.toast(`签发完成：成功 ${ok}，失败 ${fail}`, ok ? "success" : "error");
    load();
  }
})();
