-- ============================================================================
-- schema_v17：多端登录互踢 + 测试记录一键清空
--   1) profiles.session_token：当前有效会话令牌。新设备登录时写入新令牌，
--      旧设备前端心跳比对发现令牌不一致即强制下线（同一账号只保留最后登录一端）。
--   2) admin_purge_test_data：管理员清空正式答卷、异常行为、练习记录、申诉、
--      证书、站内消息等测试产生的业务记录；不删除账号与题库。
-- ============================================================================

-- 1. 会话令牌字段
alter table public.profiles
  add column if not exists session_token text not null default '';

-- 登录成功后，当前设备写入自己的会话令牌（security definer，绕过选手自助改资料的 RLS 限制）
create or replace function public.touch_session(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;
  update public.profiles
     set session_token = p_token
   where id = auth.uid();
end;
$$;

grant execute on function public.touch_session(text) to authenticated;

-- 2. 一键清空测试业务记录（仅管理员）
create or replace function public.admin_purge_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts  integer;
  v_cheat     integer;
  v_practice  integer;
  v_appeals   integer;
  v_certs     integer;
  v_msgs      integer;
begin
  if not public.is_admin() then
    raise exception '无权限操作';
  end if;

  -- 先删子表，再删主表，避免外键约束拦截
  delete from public.cheat_events;  get diagnostics v_cheat    = row_count;
  delete from public.appeals;       get diagnostics v_appeals  = row_count;
  delete from public.certificates;  get diagnostics v_certs    = row_count;
  delete from public.attempts;      get diagnostics v_attempts = row_count;
  delete from public.practice_records; get diagnostics v_practice = row_count;
  delete from public.messages;      get diagnostics v_msgs     = row_count;

  perform public.log_action(
    '清空测试记录',
    format('答卷 %s、异常 %s、练习 %s、申诉 %s、证书 %s、消息 %s',
           v_attempts, v_cheat, v_practice, v_appeals, v_certs, v_msgs)
  );

  return jsonb_build_object(
    'attempts', v_attempts, 'cheat', v_cheat, 'practice', v_practice,
    'appeals', v_appeals, 'certificates', v_certs, 'messages', v_msgs
  );
end;
$$;

grant execute on function public.admin_purge_test_data() to authenticated;
