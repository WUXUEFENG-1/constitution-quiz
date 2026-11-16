/* ============================================================
 *  全站配置（唯一需要修改的文件）
 *  SUPABASE_URL / SUPABASE_ANON_KEY 来自 Supabase 控制台 → API
 *  注意：不要把 service_role key 写进这个文件。
 * ============================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: "https://ieymycjucpbuhiunzunv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GGqi8VCf2XbbudCuL2Y78A_mOjysbY2",

  /* 学号登录用：注册时前端把“学号”拼成 学号@DOMAIN_SUFFIX 作为邮箱，
     不需要学生真的拥有邮箱。后缀只用于本地拼装，无需真实可解析。 */
  DOMAIN_SUFFIX: "xfjs.local",

  ORG_NAME: "云南工业信息职业学院",
  EVENT_NAME: "第二届“学宪法 讲宪法”校园知识竞赛",
  EVENT_SHORT: "学宪法 讲宪法"
};
