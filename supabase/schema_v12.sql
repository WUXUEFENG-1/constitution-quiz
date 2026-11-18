-- ============================================================================
-- schema_v12：异常行为记录管理
--   新增管理员删除单条作弊/异常记录的 RPC（安全定义器，仅管理员可调用）。
--   选手/角色过滤在前端按 profiles.role 处理：管理员、子管理员、出题员、监考员、
--   统计员等工作人员不计入异常记录与实时监考统计，只统计参赛选手。
-- ============================================================================

create or replace function public.admin_delete_cheat(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;
  delete from public.cheat_events where id = p_id;
  perform public.log_action('删除异常行为记录', p_id::text);
end;
$$;

grant execute on function public.admin_delete_cheat(uuid) to authenticated;
