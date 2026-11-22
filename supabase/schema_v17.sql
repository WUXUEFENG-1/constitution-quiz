-- ============================================================================
-- schema_v17：多端登录互踢
--   profiles.session_token：当前有效会话令牌。新设备登录时写入新令牌，
--   旧设备前端心跳比对发现令牌不一致即强制下线（同一账号只保留最后登录一端）。
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
