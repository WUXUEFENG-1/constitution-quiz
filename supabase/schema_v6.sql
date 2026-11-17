-- ============================================================
-- v6：系部名称统一为六个二级学院（关键词模糊匹配，与注册/下拉选项一致）
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可。
-- 执行前可先运行第 1 段诊断，核对旧值；确认后再执行第 2 段更新。
-- 班级（class_name）不做改动，仅归一化系部（department）。
-- 规则：只要系名包含对应关键词，即自动归入标准学院，例如
--   “应用经济系 / 应用经济学 / 应用经济学院” → 应用经济学院
--   “数控技术系 / 数控加工系 / 数控加工学院” → 数控加工学院
-- ============================================================

-- 1) 诊断：查看当前各系部旧值与人数（执行更新前先跑这段）
select trim(department) as department,
       count(*)        as cnt
  from public.profiles
 where role = 'contestant'
 group by trim(department)
 order by cnt desc;

-- 2) 归一化：按关键词模糊匹配到标准学院（未匹配到的旧值保持原样，便于人工再处理）
update public.profiles
   set department = case
        when trim(department) like '%应用经济%'
          or trim(department) like '%经济%'            then '应用经济学院'
        when trim(department) like '%数控%'           then '数控加工学院'
        when trim(department) like '%电气%'           then '电气工程学院'
        when trim(department) like '%汽车%'           then '汽车工程学院'
        when trim(department) like '%机械%'
          or trim(department) like '%机器人%'          then '机械工程学院'
        when trim(department) like '%现代服务%'
          or trim(department) like '%服务%'            then '现代服务学院'
        else department
      end
 where role = 'contestant'
   and trim(department) <> ''
   and (
        trim(department) not in (
          '应用经济学院', '数控加工学院', '汽车工程学院',
          '机械工程学院', '电气工程学院', '现代服务学院'
        )
   );

-- 3) 复核：更新后各学院人数，应只出现六个标准学院名（或空值/未匹配项）
select department,
       count(*) as cnt
  from public.profiles
 where role = 'contestant'
 group by department
 order by cnt desc;
