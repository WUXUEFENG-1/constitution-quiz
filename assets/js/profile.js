/* 个人中心：信息、改密、历史成绩（含在线练习） */
(function () {
  let profile = null;

  init();

  async function init() {
    try { const ctx = await API.guard("contestant"); profile = ctx.profile; } catch (e) { return; }
    document.getElementById("userChip").textContent = profile.full_name || "选手";
    document.getElementById("logoutBtn").onclick = () => API.signOut();
    await API.loadSettings();

    bindTabs();
    fillInfo();
    bindInfo();
    bindPwd();
    await loadHistory();
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        ["info", "password", "history"].forEach((k) => {
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

  function readPracticeHistory() {
    try { return JSON.parse(localStorage.getItem("xfjs_practice_history") || "[]"); }
    catch (e) { return []; }
  }

  async function loadHistory() {
    const { data } = await API.sb.from("attempts")
      .select("*").eq("user_id", profile.id)
      .order("submitted_at", { ascending: false, nullsFirst: false });
    const comps = await API.sb.from("competitions").select("id,title");
    const compMap = Object.fromEntries((comps.data || []).map((c) => [c.id, c.title]));

    const examRows = (data || []).filter((a) => a.status === "submitted").map((a) => ({
      ...a,
      kind: "exam",
      title: compMap[a.competition_id] || "校园知识竞赛"
    }));
    const practiceRows = readPracticeHistory().map((p) => ({ ...p, kind: "practice" }));

    const rows = [...examRows, ...practiceRows].sort(
      (x, y) => new Date(y.submitted_at || 0) - new Date(x.submitted_at || 0)
    );

    const body = document.getElementById("historyBody");
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">暂无答题记录</td></tr>';
      return;
    }
    body.innerHTML = rows.map((a) => {
      const pct = a.total_score > 0 ? Math.round((a.score / a.total_score) * 100) : 0;
      const dur = Math.floor((a.duration_seconds || 0) / 60) + "分" + ((a.duration_seconds || 0) % 60) + "秒";
      const tag = a.kind === "practice"
        ? '<span class="badge gray" style="margin-right:6px">练习</span>'
        : '<span class="badge blue" style="margin-right:6px">竞赛</span>';
      const op = a.kind === "practice"
        ? '<a class="link-btn" href="practice.html">再练一组</a>'
        : `<a class="link-btn" href="result.html?id=${a.id}">查看解析</a>`;
      return `<tr>
        <td>${tag}${API.escapeHtml(a.title || "在线练习")}</td>
        <td class="mono"><b>${a.score}</b></td><td>${a.total_score}</td>
        <td>${a.correct_count}/${a.question_count}</td><td>${pct}%</td>
        <td>${dur}</td>
        <td>${API.fmtTime(a.submitted_at)}</td>
        <td>${op}</td>
      </tr>`;
    }).join("");
  }
})();
