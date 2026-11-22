-- ============================================================================
-- schema_v17：多端登录互踢 + 测试账号记录清理
--   1) profiles.session_token：当前有效会话令牌。新设备登录时写入新令牌，
--      旧设备前端心跳比对发现令牌不一致即强制下线（同一账号只保留最后登录一端）。
--   2) admin_purge_test_data：管理员仅清理测试账号（吴雪枫 / 学号 25104013101128）
--      名下的答卷、异常行为、练习记录、申诉、证书、站内消息；其他选手记录全部保留，
--      不删除任何账号、题库与花名册。
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

-- 2. 清理测试账号名下的业务记录（仅管理员，其他选手记录保留）
create or replace function public.admin_purge_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid;
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

  -- 测试账号：吴雪枫 / 学号 25104013101128
  select id into v_uid
    from public.profiles
   where student_no = '25104013101128'
   limit 1;

  if v_uid is null then
    return jsonb_build_object(
      'attempts', 0, 'cheat', 0, 'practice', 0,
      'appeals', 0, 'certificates', 0, 'messages', 0,
      'note', '未找到测试账号 25104013101128'
    );
  end if;

  -- 先删子表，再删主表，避免外键约束拦截；均按测试账号 user_id 过滤
  delete from public.cheat_events       where user_id = v_uid; get diagnostics v_cheat     = row_count;
  delete from public.appeals            where user_id = v_uid; get diagnostics v_appeals = row_count;
  delete from public.certificates       where user_id = v_uid; get diagnostics v_certs   = row_count;
  delete from public.attempts           where user_id = v_uid; get diagnostics v_attempts = row_count;
  delete from public.practice_records   where user_id = v_uid; get diagnostics v_practice = row_count;
  delete from public.messages           where user_id = v_uid; get diagnostics v_msgs     = row_count;

  perform public.log_action(
    '清理测试账号记录',
    format('测试账号 25104013101128：答卷 %s、异常 %s、练习 %s、申诉 %s、证书 %s、消息 %s',
           v_attempts, v_cheat, v_practice, v_appeals, v_certs, v_msgs)
  );

  return jsonb_build_object(
    'attempts', v_attempts, 'cheat', v_cheat, 'practice', v_practice,
    'appeals', v_appeals, 'certificates', v_certs, 'messages', v_msgs
  );
end;
$$;

grant execute on function public.admin_purge_test_data() to authenticated;
