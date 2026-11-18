-- ============================================================================
-- schema_v11：清理赛事删除后的残留答卷与作弊记录
--   背景：attempts.competition_id 外键为 on delete set null，删除赛事后答卷不会被
--   级联删除，会在监考面板留下“孤儿答卷”；其关联作弊事件也残留。
--   本脚本：① 立即清理当前残留；② 新增管理员 RPC，供以后一键清理。
-- ============================================================================

-- ① 立即清理：孤儿答卷关联的作弊事件
delete from public.cheat_events c
 where c.attempt_id in (
   select a.id from public.attempts a
    where a.competition_id is null
       or not exists (select 1 from public.competitions cp where cp.id = a.competition_id)
 );

-- ① 立即清理：未关联任何答卷的游离作弊事件（监控页误触发、未进入答题产生的记录）
delete from public.cheat_events c where c.attempt_id is null;

-- ① 立即清理：孤儿答卷（赛事已删除或归属为空）
delete from public.attempts a
 where a.competition_id is null
    or not exists (select 1 from public.competitions cp where cp.id = a.competition_id);

-- ② 以后复用：管理员一键清理 RPC
create or replace function public.admin_purge_orphans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheat_linked integer := 0;
  v_cheat_standalone integer := 0;
  v_attempt integer := 0;
begin
  if not public.is_admin() then
    raise exception '需要管理员权限';
  end if;

  delete from public.cheat_events c
   where c.attempt_id in (
     select a.id from public.attempts a
      where a.competition_id is null
         or not exists (select 1 from public.competitions cp where cp.id = a.competition_id)
   );
  get diagnostics v_cheat_linked = row_count;

  delete from public.cheat_events c where c.attempt_id is null;
  get diagnostics v_cheat_standalone = row_count;

  delete from public.attempts a
   where a.competition_id is null
      or not exists (select 1 from public.competitions cp where cp.id = a.competition_id);
  get diagnostics v_attempt = row_count;

  return jsonb_build_object(
    'cheat_linked_deleted', v_cheat_linked,
    'cheat_standalone_deleted', v_cheat_standalone,
    'attempts_deleted', v_attempt
  );
end;
$$;

grant execute on function public.admin_purge_orphans() to authenticated;
