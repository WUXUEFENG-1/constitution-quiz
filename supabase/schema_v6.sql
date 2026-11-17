-- ============================================================
-- v6：系部名称统一为六个二级学院（与注册/下拉选项一致）
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可。
-- 执行前可先运行第 1 段诊断，核对旧值；确认后再执行第 2 段更新。
-- 班级（class_name）不做改动，仅归一化系部（department）。
-- ============================================================

-- 1) 诊断：查看当前各系部旧值与人数（执行更新前先跑这段）
select trim(department) as department,
       count(*)        as cnt
  from public.profiles
 where role = 'contestant'
 group by trim(department)
 order by cnt desc;

-- 2) 归一化：旧系名 → 新学院名（未匹配到的旧值保持原样，便于人工再处理）
update public.profiles
   set department = case trim(department)
        when '数控技术系'   then '数控加工学院'
        when '数控加工系'   then '数控加工学院'
        when '数控加工学院' then '数控加工学院'
        when '应用经济系'   then '应用经济学院'
        when '应用经济学院' then '应用经济学院'
        when '电气工程系'   then '电气工程学院'
        when '电气工程学院' then '电气工程学院'
        when '汽车工程系'   then '汽车工程学院'
        when '汽车工程学院' then '汽车工程学院'
        when '机械工程系'   then '机械工程学院'
        when '机械工程学院' then '机械工程学院'
        when '现代服务系'   then '现代服务学院'
        when '现代服务学院' then '现代服务学院'
        else department
      end
 where role = 'contestant'
   and trim(department) in (
        '数控技术系', '数控加工系', '数控加工学院',
        '应用经济系', '应用经济学院',
        '电气工程系', '电气工程学院',
        '汽车工程系', '汽车工程学院',
        '机械工程系', '机械工程学院',
        '现代服务系', '现代服务学院'
   );

-- 3) 复核：更新后各学院人数，应只出现六个标准学院名（或空值/未匹配项）
select department,
       count(*) as cnt
  from public.profiles
 where role = 'contestant'
 group by department
 order by cnt desc;
