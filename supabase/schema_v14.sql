-- ============================================================================
-- schema_v14：登录与操作日志
--   admin_list_logs：安全定义器 RPC 取日志（避免前端直连受 RLS / 关联策略影响导致空白）。
--   admin_delete_log：管理员删除单条日志。
--   admin_clear_logs：管理员清空全部日志（保留本次“清空日志”操作记录）。
-- ============================================================================

create or replace function public.admin_list_logs()
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
    select l.id, l.user_id, l.role, l.action, l.detail, l.created_at
    from public.audit_logs l
    order by l.created_at desc
    limit 500
  ) t;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_logs() to authenticated;

create or replace function public.admin_delete_log(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;
  delete from public.audit_logs where id = p_id;
  perform public.log_action('删除日志', p_id::text);
end;
$$;

grant execute on function public.admin_delete_log(bigint) to authenticated;

create or replace function public.admin_clear_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;
  delete from public.audit_logs where id is not null;
  get diagnostics v_n = row_count;
  perform public.log_action('清空日志', '共清理 ' || v_n || ' 条');
  return v_n;
end;
$$;

grant execute on function public.admin_clear_logs() to authenticated;
