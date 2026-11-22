-- ============================================================================
-- schema_v16：答卷（成绩）删除
--   admin_delete_attempt：管理员删除指定答卷，并级联清理关联的异常行为、
--   申诉、证书记录；不删除账号本身。
-- ============================================================================

create or replace function public.admin_delete_attempt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;

  delete from public.cheat_events  where attempt_id = p_id;
  delete from public.appeals       where attempt_id = p_id;
  delete from public.certificates  where attempt_id = p_id;
  delete from public.attempts      where id = p_id;

  perform public.log_action('删除成绩', p_id::text);
end;
$$;

grant execute on function public.admin_delete_attempt(uuid) to authenticated;
