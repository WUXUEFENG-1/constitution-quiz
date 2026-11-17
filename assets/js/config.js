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
  EVENT_SHORT: "学宪法 讲宪法",

  /* 主办 / 承办 / 技术支持 / 页脚单位（需求 4、5） */
  HOST_UNIT: "云南工业信息职业学院学生处、团委、基础教学部",
  ORGANIZER_UNIT: "云南工业信息职业学院学生青年成长社",
  SUPPORT_UNIT: "云南工业信息职业学院青年成长社",
  FOOTER_MAIN: "云南工业信息职业学院学生处、团委、基础教学部、学生青年成长社"
};

/* 统一校正移动端视口宽度（拼接构造，避免静态元信息被误写） */
(function () {
  var m = document.querySelector('meta[name="viewport"]');
  var w = 'device' + '-' + 'width';
  if (m) m.setAttribute('content', 'width=' + w + ', initial-scale=1');
})();
