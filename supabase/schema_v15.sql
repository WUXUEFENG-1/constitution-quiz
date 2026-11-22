-- ============================================================================
-- schema_v15：班级花名册（应到人数基线）+ 批量导入 / 批量删除
--   表 public.class_roster：系部、班级、应到人数。
--   admin_list_roster：工作人员读取花名册。
--   admin_delete_roster：管理员按 id 批量删除班级。
--   admin_import_roster：管理员批量导入 / 覆盖班级（按班级名去重）。
-- ============================================================================

create table if not exists public.class_roster (
  id          bigint generated always as identity primary key,
  dept        text not null default '',
  class_name  text not null,
  total       int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (class_name)
);

alter table public.class_roster enable row level security;

drop policy if exists roster_read on public.class_roster;
create policy roster_read on public.class_roster for select
  using (public.is_staff());

-- 种子：沿用现有静态花名册（班级名已存在则跳过）
insert into public.class_roster (dept, class_name, total) values
('电气工程学院','电气自动化技术2401班',53),
('电气工程学院','电气自动化技术2402班',52),
('电气工程学院','电气自动化技术2403班',55),
('电气工程学院','电气自动化技术2404班',55),
('电气工程学院','电气自动化技术2405班',52),
('电气工程学院','工业机器人技术2401班',40),
('应用经济学院','计算机网络技术2401班',48),
('应用经济学院','计算机网络技术2402班',47),
('应用经济学院','计算机网络技术2403班',45),
('数控技术学院','数控技术2401班',41),
('数控技术学院','数控技术2402班',47),
('数控技术学院','数控技术2403班',48),
('机械工程学院','机械制造及自动化2401班',43),
('机械工程学院','机械制造及自动化2402班',45),
('机械工程学院','机械制造及自动化2403班',47),
('数控技术学院','数字化设计与制造技术2501班',39),
('数控技术学院','数字化设计与制造技术2502班',44),
('数控技术学院','数字化设计与制造技术2503班',38),
('数控技术学院','数字化设计与制造技术2504班',40),
('数控技术学院','数控技术2501班',49),
('数控技术学院','数控技术2502班',47),
('数控技术学院','数控技术2503班',48),
('机械工程学院','机械制造及自动化2501班',46),
('机械工程学院','机械制造及自动化2502班',44),
('机械工程学院','机械制造及自动化2503班',49),
('机械工程学院','机械制造及自动化2504班',44),
('机械工程学院','智能焊接技术2501班',50),
('机械工程学院','智能焊接技术2502班',47),
('电气工程学院','机电一体化技术2501班',47),
('电气工程学院','机电一体化技术2502班',41),
('电气工程学院','机电一体化技术2503班',45),
('电气工程学院','机电一体化技术2504班',44),
('电气工程学院','机电一体化技术2505班',45),
('电气工程学院','机电一体化技术2506班',45),
('电气工程学院','机电一体化技术2507班',46),
('电气工程学院','工业机器人技术2501班',44),
('电气工程学院','工业机器人技术2502班',51),
('电气工程学院','电气自动化技术2501班',54),
('电气工程学院','电气自动化技术2502班',52),
('电气工程学院','电气自动化技术2503班',51),
('电气工程学院','电气自动化技术2504班',51),
('电气工程学院','电气自动化技术2505班',51),
('电气工程学院','电气自动化技术2506班',51),
('汽车工程学院','新能源汽车技术2501班',38),
('汽车工程学院','新能源汽车技术2502班',42),
('汽车工程学院','新能源汽车技术2503班',41),
('汽车工程学院','新能源汽车技术2504班',37),
('应用经济学院','计算机网络技术2501班',41),
('应用经济学院','计算机网络技术2502班',46),
('应用经济学院','计算机网络技术2503班',47),
('应用经济学院','计算机网络技术2504班',44),
('电气工程学院','电气自动化技术2601班',45),
('电气工程学院','电气自动化技术2602班',42),
('电气工程学院','电气自动化技术2603班',44),
('电气工程学院','电气自动化技术2604班',42),
('电气工程学院','工业互联网技术2601班',38),
('电气工程学院','工业互联网技术2602班',42),
('电气工程学院','工业机器人技术2601班',39),
('电气工程学院','工业机器人技术2602班',40),
('电气工程学院','工业机器人技术2603班',40),
('电气工程学院','机电一体化技术2601班',45),
('电气工程学院','机电一体化技术2602班',45),
('电气工程学院','机电一体化技术2603班',46),
('机械工程学院','机械制造及自动化2601班',46),
('机械工程学院','机械制造及自动化2602班',41),
('机械工程学院','机械制造及自动化2603班',42),
('机械工程学院','智能焊接技术2601班',45),
('机械工程学院','智能焊接技术2602班',42),
('机械工程学院','智能焊接技术2603班',44),
('汽车工程学院','新能源汽车技术2601班',41),
('汽车工程学院','新能源汽车技术2602班',42),
('汽车工程学院','新能源汽车技术2603班',43),
('汽车工程学院','新能源汽车检测与维修2601班',44),
('汽车工程学院','新能源汽车检测与维修2602班',48),
('数控加工学院','数控技术2601班',40),
('数控加工学院','数控技术2602班',36),
('数控加工学院','数控技术2603班',46),
('数控加工学院','数字化设计与制造技术2601班',43),
('数控加工学院','数字化设计与制造技术2602班',40),
('数控加工学院','数字化设计与制造技术2603班',41),
('现代服务学院','烹饪工艺与营养2601班',42),
('现代服务学院','烹饪工艺与营养2602班',39),
('应用经济学院','计算机网络技术2601班',44),
('应用经济学院','计算机网络技术2602班',46),
('应用经济学院','计算机网络技术2603班',44),
('应用经济学院','人工智能技术应用2601班',45),
('应用经济学院','人工智能技术应用2602班',47),
('应用经济学院','软件技术2601班',38),
('应用经济学院','软件技术2602班',38)
on conflict (class_name) do nothing;

-- ----------------------------------------------------------------------------
-- 读取花名册
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_roster()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not public.is_staff() then
    raise exception '无权限操作';
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_out
  from (
    select r.id, r.dept, r.class_name, r.total
    from public.class_roster r
    order by r.dept, r.class_name
  ) t;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_roster() to authenticated;

-- ----------------------------------------------------------------------------
-- 批量删除班级
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_roster(p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;

  delete from public.class_roster where id = any (p_ids);
  perform public.log_action('删除班级', 'ids=' || array_to_string(p_ids, ','));
end;
$$;

grant execute on function public.admin_delete_roster(bigint[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 批量导入 / 覆盖班级（按班级名 upsert）
-- 入参 p_rows：jsonb 数组，元素 dept / class_name / total
-- ----------------------------------------------------------------------------
create or replace function public.admin_import_roster(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r         jsonb;
  v_dept    text;
  v_class   text;
  v_total   int;
  v_count   int := 0;
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_class := trim(coalesce(r ->> 'class_name', ''));
    if v_class = '' then
      continue;
    end if;
    v_dept  := trim(coalesce(r ->> 'dept', ''));
    v_total := case when trim(coalesce(r ->> 'total', '')) ~ '^[0-9]+$'
                    then trim(coalesce(r ->> 'total', ''))::int
                    else 0 end;

    insert into public.class_roster (dept, class_name, total)
    values (v_dept, v_class, v_total)
    on conflict (class_name) do update
      set dept = excluded.dept,
          total = excluded.total;

    v_count := v_count + 1;
  end loop;

  perform public.log_action('导入班级', '共 ' || v_count || ' 条');
  return v_count;
end;
$$;

grant execute on function public.admin_import_roster(jsonb) to authenticated;
