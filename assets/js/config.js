/* ============================================================
 * 全站配置（唯一需要修改的文件）
 * 部署到 GitHub Pages 前，把下面两项换成你自己的 Supabase 项目参数：
 *   Supabase 控制台 → Project Settings → API
 *   - SUPABASE_URL      形如 https://xxxxx.supabase.co
 *   - SUPABASE_ANON_KEY 形如 eyJhbGciOi... （anon public，可以公开在前端）
 * 绝对不要把 service_role key 写进这个文件。
 * ============================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-SUPABASE-ANON-KEY",

  /* 学号登录用：注册时前端把“学号”拼成 学号@DOMAIN_SUFFIX 作为邮箱，
     不需要学生真的拥有邮箱。后缀只用于本地拼装，无需真实可解析。 */
  DOMAIN_SUFFIX: "xfjs.local",

  ORG_NAME: "云南工业信息职业学院",
  EVENT_NAME: "第二届“学宪法 讲宪法”校园知识竞赛",
  EVENT_SHORT: "学宪法 讲宪法"
};
