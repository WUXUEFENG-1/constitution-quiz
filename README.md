# 云南工业信息职业学院 第二届“学宪法 讲宪法”校园知识竞赛系统

基于 **GitHub Pages（前端） + Supabase（数据库 / 登录）** 的校级在线知识竞赛平台。全部代码已在真实 PostgreSQL 上验证判分逻辑，并在浏览器中逐页验证无报错。

- 选手端：注册、登录、报名、在线练习（带答案与解析）、限时答题、成绩回顾
- 管理端：报名统计（按系部/班级汇总）、题库导入与管理（单选/多选/判断/填空）、开放答题入口（设置答题时间与时长）、答题成绩导出 CSV

## 一、目录结构

```
constitution-quiz/
├─ index.html            登录（学号登录）
├─ signup.html           选手注册
├─ dashboard.html        选手中心（报名、答题入口、我的成绩）
├─ practice.html         在线练习（不计成绩）
├─ exam.html             正式答题（倒计时、答题卡、自动交卷）
├─ admin.html            管理后台（报名/题库/设置/成绩）
├─ assets/css/style.css  全站样式（蓝白主色）
└─ assets/js/
   ├─ config.js          【唯一需要修改的文件】Supabase 参数与院校名称
   ├─ core.js            初始化、登录守卫、CSV 导出、toast
   ├─ index.js / signup.js / dashboard.js / practice.js / exam.js / admin.js
└─ supabase/
   ├─ schema.sql          表结构 + 权限策略 + 判分函数（必执行）
   ├─ seed_questions.sql  40 道宪法题库种子（可选）
   └─ 题库导入模板.csv     批量导入模板
└─ .github/workflows/pages.yml   GitHub Pages 自动部署
```

## 二、部署步骤（约 15 分钟）

### 1. 开启 GitHub Pages
仓库 → Settings → Pages → Source 选择 **GitHub Actions**。
首次推送后 `.github/workflows/pages.yml` 会自动构建并发布，站点地址：
`https://WUXUEFENG-1.github.io/constitution-quiz/`

### 2. 创建 Supabase 项目
1. 登录 <https://supabase.com> → New project（区域建议选 Singapore，离云南较近）
2. 等数据库初始化完成（约 2 分钟）

### 3. 初始化数据库
在 Supabase 控制台 → **SQL Editor** → New query，依次整段执行：
1. `supabase/schema.sql`（建表、RLS 权限、抽题与判分函数）
2. `supabase/seed_questions.sql`（导入 40 道示例题库，会先清空 questions 表）

执行成功后最后一步会输出各题型题数与总分（应为单选 20 / 多选 6 / 判断 8 / 填空 6，合计 92 分）。

### 4. 关闭邮箱确认（重要）
学号登录是把“学号”拼成 `学号@xfjs.local` 作为邮箱，这些邮箱不存在，因此必须关闭邮箱验证：

**Authentication → Providers → Email** 中：
- 关闭 `Confirm email`（Enable email confirmations）
- 建议同时关闭 `Secure email change`

否则注册后会提示“账号需要邮箱确认”，无法登录。

### 5. 填入前端配置
Supabase 控制台 → **Project Settings → API**，拷两个值：
- Project URL（形如 `https://abcdefg.supabase.co`）
- anon public key（形如 `eyJhbGciOi...`，可公开，**不要**用 service_role key）

打开 `assets/js/config.js` 替换：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  ...
};
```

提交后 GitHub Pages 自动重新部署（约 1 分钟）。未填前网站顶部会出现黄色提示条，属正常。

### 6. 开通管理员账号
1. 在网站注册一个账号：**学号填 `admin`**，姓名填“系统管理员”
2. 在 Supabase SQL Editor 执行：

```sql
update public.profiles set role = 'admin' where student_no = 'admin';
```

3. 用 `admin` 登录，会自动跳到管理后台 `admin.html`

### 7. 配置比赛并开放答题
管理后台 → “答题设置”：
- 勾选“开放答题入口”或点“一键开放/关闭”
- 设置开放时间、截止时间、答题时长（分钟）、抽题数量（不超过题库题数）、是否随机出题
- 保存后选手端立即生效（服务端会再校验一次时间，改前端时间无效）

## 三、题库导入

管理后台 → “题库管理” 提供三种方式：

1. **在线新增**：逐题填写（题干、选项、答案、分值、解析）
2. **Excel / CSV 导入**：点“下载模板”得到 `题库导入模板.csv`，按列填写后上传即可（.xlsx / .csv 均可）
3. **SQL 导入**：直接改 `seed_questions.sql` 在 SQL Editor 执行

Excel 列顺序：`题型 | 题干 | 选项A | 选项B | 选项C | 选项D | 正确答案 | 分值 | 解析`

答案填写规则：

| 题型 | 选项列 | 正确答案写法 |
|---|---|---|
| 单选 | A、B、C、D 均必填 | `C` |
| 多选 | A、B、C、D 均必填 | `ABD` 或 `A,B,D` |
| 判断 | 留空（系统固定为正确/错误） | `正确` 或 `错误` |
| 填空 | 留空；多空数即答案数 | `人民` 或 `人民\|全国人民代表大会` |

判断题固定选项为 `["正确","错误"]`，对应 A=正确、B=错误。

## 四、判分规则

判分全部在数据库函数 `submit_exam()` 内完成，**答案不下发到浏览器**（选手抓包也拿不到答案）：

- 单选 / 判断：完全匹配才得分
- 多选：集合比对且必须全对，**少选、多选、错选均 0 分**
- 填空：按空位顺序比对，忽略空格（含全角空格）与英文大小写

## 五、权限与安全设计

| 内容 | 选手 | 管理员 |
|---|---|---|
| 题目表 `questions`（含答案） | 不可直接读 | 可读写 |
| 抽题 `start_exam()` | 只能拿到不含答案的题目快照 | — |
| 练习 `get_practice_questions()` | 可拿到答案与解析（不计成绩） | — |
| 报名记录 | 只能看自己 | 可看全部 |
| 答卷 `attempts` | 只能看自己的成绩 | 可看全部 |
| 赛事设置 | 只读开放状态 | 可修改 |

- 所有表开启 RLS，前端只使用 anon key
- 未报名不能进入答题；每人只能答一次（`unique(user_id)`），未交卷可断点续答
- 答题中途刷新/关页：倒计时按服务端 `started_at` 计算，答案暂存本地并在提交时校验

## 六、常见问题

**顶部黄条一直显示“系统尚未连接数据库”**：`config.js` 未替换成功，或 anon key 长度不足（判定需 >40 字符且不含 `YOUR-`）。

**登录提示“学号或密码不正确”**：密码错误；或注册时提示需邮箱确认（未关闭 Confirm email）。

**注册提示“该学号已注册”**：一个学号只能注册一次。需重置可在 Supabase → Authentication → Users 删除该用户（会级联删除档案、报名与答卷）。

**答题页提示“请先在选手中心完成报名”**：先回 `dashboard.html` 点“立即报名参赛”。

**导出 CSV 中文乱码**：已带 UTF-8 BOM，Excel / WPS 可直接双击打开。

**修改了 config.js 但网站没变化**：浏览器缓存，`Ctrl+F5` 强制刷新，或等 GitHub Actions 跑完。

**想允许重复作答**：在 SQL Editor 执行 `drop index public.uq_attempts_user;`（不推荐，会影响排名公平性）。

## 七、本地验证记录

- 数据库：在本地 PostgreSQL 中完整执行 `schema.sql` + 种子题库，模拟选手全对提交得 24/24（随机 10 题）；填空带空格与全角空格仍判对；多选少选扣 4 分（88/92）；以 `authenticated` 角色验证选手侧可见题目数 0，RLS 生效。
- 前端：Chromium 逐页截图，6 个页面均无 JS 报错。

---

用户：云南工业信息职业学院 计算机网络技术 20260001 吴雪枫


## 线上地址

- 站点：https://wuxuefeng-1.github.io/constitution-quiz/
- 
