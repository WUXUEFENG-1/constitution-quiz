/* ============================================================
 * 全站配置（唯一需要修改的文件）
 * Supabase 控制台 → Project Settings → API 取 URL 与 anon public key。
 * 绝对不要把 service_role key 写进这个文件。
 * ============================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: "https://ieymycjucpbuhiunzunv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GGqi8VCf2XbbudCuL2Y78A_mOjysbY2",

  /* 学号登录：注册时前端把“学号”拼成 学号@DOMAIN_SUFFIX 作为邮箱 */
  DOMAIN_SUFFIX: "xfjs.local",

  ORG_NAME: "云南工业信息职业学院",
  EVENT_NAME: "第二届“学宪法 讲宪法”校园知识竞赛",

  /* 二级学院 / 系部（下拉选项，如需增减在此统一修改） */
  DEPARTMENTS: [
    "应用经济学院", "数控加工学院", "汽车工程学院",
    "机械工程学院", "电气工程学院", "现代服务学院"
  ]
};

/* 统一校正 / 注入移动端视口宽度（拼接构造，避免静态元信息被误写） */
(function () {
  var w = 'device' + '-' + 'width';
  var m = document.querySelector('meta[name="viewport"]');
  if (!m) {
    m = document.createElement('meta');
    m.setAttribute('name', 'viewport');
    document.head.appendChild(m);
  }
  m.setAttribute('content', 'width=' + w + ', initial-scale=1');
})();
