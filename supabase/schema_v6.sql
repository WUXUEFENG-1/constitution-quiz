-- ============================================================
-- v6：系部 / 班级名称归一化（与注册、下拉选项一致）
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可。
-- 执行前可先运行第 1 段诊断，核对旧值；确认后再执行更新。
-- 系部：按关键词模糊匹配到标准学院；班级：去空格、缺“班”字按数字结尾自动补全。
-- 例：“应用经济系 / 应用经济学” → 应用经济学院；
--     “计算机网络技术2602” → “计算机网络技术2602班”。
-- ============================================================

-- 1) 诊断：查看当前各系部旧值与人数（执行更新前先跑这段）
select trim(department) as department,
       count(*)        as cnt
  from public.profiles
 where role = 'contestant'
 group by trim(department)
 order by cnt desc;

-- 2) 系部归一化：按关键词模糊匹配到标准学院（未匹配到的旧值保持原样，便于人工再处理）
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

-- 3) 班级归一化：去掉首尾/中间空格；以数字结尾但缺“班”字的自动补全
--    例：“计算机网络技术2602” → “计算机网络技术2602班”
update public.profiles
   set class_name = case
        when trim(class_name) ~ '班$' then trim(class_name)
        when trim(class_name) ~ '[0-9]{2,4}$' then trim(class_name) || '班'
        else trim(class_name)
      end
 where role = 'contestant'
   and trim(class_name) <> ''
   and (
        trim(class_name) ~ '[0-9]{2,4}$'
        or class_name ~ '\s'
   );

-- 4) 复核：更新后各学院 / 班级人数
select department, class_name,
       count(*) as cnt
  from public.profiles
 where role = 'contestant'
 group by department, class_name
 order by cnt desc;
