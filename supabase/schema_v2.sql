-- ============================================================================
--  竞赛系统 v2 迁移脚本（在现有 schema.sql 基础上增量执行，可重复运行）
--  覆盖：多角色权限、赛事、公告、申诉、消息、证书、作弊记录、审计日志、
--        题库分类、系统设置；选手自助改密；管理员建号 / 封禁 / 重置密码 / 删除。
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. profiles 扩展：状态、封禁原因、多角色
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists status     text not null default 'active';
alter table public.profiles add column if not exists ban_reason text not null default '';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add  constraint profiles_role_check
  check (role in ('contestant','admin','sub_admin','questioner','proctor','statistician'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add  constraint profiles_status_check
  check (status in ('active','banned'));

-- ----------------------------------------------------------------------------
-- 2. 题库分类
-- ----------------------------------------------------------------------------
create table if not exists public.question_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_no    integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions add column if not exists category_id uuid references public.question_categories(id) on delete set null;
create index if not exists idx_questions_category on public.questions (category_id);

-- ----------------------------------------------------------------------------
-- 3. 赛事（多场竞赛；当前进行中的一场 status='open'）
-- ----------------------------------------------------------------------------
create table if not exists public.competitions (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  subtitle         text not null default '',
  rules            text not null default '',
  start_at         timestamptz,
  end_at           timestamptz,
  duration_minutes integer not null default 30,
  question_count   integer not null default 40,
  shuffle          boolean not null default true,
  status           text not null default 'draft' check (status in ('draft','open','closed','finished')),
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_competitions_status on public.competitions (status);

-- ----------------------------------------------------------------------------
-- 4. 公告
-- ----------------------------------------------------------------------------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  content      text not null default '',
  kind         text not null default 'notice' check (kind in ('notice','rule','result')),
  pinned       boolean not null default false,
  is_published boolean not null default true,
  author_id    uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. 申诉（题目 / 分数异议）
-- ----------------------------------------------------------------------------
create table if not exists public.appeals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  attempt_id  uuid references public.attempts(id) on delete set null,
  qid         uuid references public.questions(id) on delete set null,
  kind        text not null check (kind in ('question','score')),
  content     text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  reply       text not null default '',
  reviewer_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  replied_at  timestamptz
);
create index if not exists idx_appeals_user on public.appeals (user_id);
create index if not exists idx_appeals_status on public.appeals (status);

-- ----------------------------------------------------------------------------
-- 6. 站内消息 / 开赛提醒
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  content    text not null default '',
  kind       text not null default 'notice' check (kind in ('notice','reminder','result','system')),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_user on public.messages (user_id, is_read);

-- ----------------------------------------------------------------------------
-- 7. 证书
-- ----------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  competition_id  uuid references public.competitions(id) on delete set null,
  attempt_id      uuid references public.attempts(id) on delete set null,
  serial_no       text not null unique,
  score           numeric(8,2) not null default 0,
  rank_no         integer,
  template        jsonb not null default '{}'::jsonb,
  issued_at       timestamptz not null default now(),
  unique (user_id, competition_id)
);

-- ----------------------------------------------------------------------------
-- 8. 作弊 / 异常行为记录
-- ----------------------------------------------------------------------------
create table if not exists public.cheat_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  attempt_id  uuid references public.attempts(id) on delete set null,
  kind        text not null check (kind in ('switch','blur','copy','focus_lost','violation')),
  detail      text not null default '',
  count       integer not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cheat_user on public.cheat_events (user_id);

-- ----------------------------------------------------------------------------
-- 9. 审计日志（登录 / 后台操作）
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  role       text not null default '',
  action     text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- 10. 系统设置（键值对：页面标题、轮播图、安全开关、DeepSeek Key 等）
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('site',        '{"title":"第二届“学宪法 讲宪法”校园知识竞赛","subtitle":"尊崇宪法 · 学法守法 · 知法用法"}'::jsonb),
  ('carousel',    '[]'::jsonb),
  ('security',    '{"captcha":true,"switch_warn":true,"max_switch":3}'::jsonb),
  ('deepseek',    '{"api_base":"https://api.deepseek.com","model":"deepseek-chat","api_key":""}'::jsonb),
  ('cert_template','{"title":"参赛证书","org":"云南工业信息职业学院","footer":"学生处 · 团委 · 基础教学部 · 学生青年成长社"}'::jsonb)
on conflict (key) do nothing;

-- 兜底：把旧 exam_settings 同步成一条赛事记录（若赛事表为空）
insert into public.competitions (title, subtitle, start_at, end_at, duration_minutes, question_count, shuffle, status, note)
select c.title, c.subtitle, s.start_at, s.end_at, s.duration_minutes, s.question_count, s.shuffle,
       case when s.is_open then 'open' else 'closed' end, s.note
from public.exam_settings s
cross join (select '第二届“学宪法 讲宪法”校园知识竞赛' as title, '线上限时答题 · 自动判分' as subtitle) c
where not exists (select 1 from public.competitions)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 11. 角色判定函数
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','sub_admin','questioner','proctor','statistician')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','sub_admin')
  );
$$;

-- 被封禁账号拦截登录态（前端 guard 读取，服务端关键 RPC 也校验）
create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'banned');
$$;

-- ----------------------------------------------------------------------------
-- 12. 审计 / 作弊 / 申诉 写入 RPC（选手可写自己的，服务端校验身份）
-- ----------------------------------------------------------------------------
create or replace function public.log_action(p_action text, p_detail text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs (user_id, role, action, detail)
  values (auth.uid(), coalesce(v_role,''), left(p_action,80), left(coalesce(p_detail,''),1000));
end;
$$;

create or replace function public.record_cheat(p_kind text, p_detail text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_attempt uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select id into v_attempt from public.attempts
  where user_id = auth.uid() and status = 'in_progress' order by started_at desc limit 1;
  insert into public.cheat_events (user_id, attempt_id, kind, detail)
  values (auth.uid(), v_attempt, p_kind, left(coalesce(p_detail,''),500));
end;
$$;

create or replace function public.submit_appeal(
  p_kind text, p_content text, p_qid uuid default null, p_attempt_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_kind not in ('question','score') then raise exception '申诉类型不支持'; end if;
  if length(trim(p_content)) < 5 then raise exception '申诉内容至少 5 个字'; end if;
  insert into public.appeals (user_id, attempt_id, qid, kind, content)
  values (auth.uid(), p_attempt_id, p_qid, p_kind, trim(p_content))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.staff_reply_appeal(p_id uuid, p_status text, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception '无权限操作'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception '状态不合法'; end if;
  update public.appeals
     set status = p_status, reply = p_reply, reviewer_id = auth.uid(), replied_at = now()
   where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. 管理员用户管理 RPC（仅 admin / sub_admin）
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_status(p_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '无权限操作'; end if;
  if p_status not in ('active','banned') then raise exception '状态不合法'; end if;
  update public.profiles set status = p_status, ban_reason = left(coalesce(p_reason,''),200) where id = p_id;
  perform public.log_action('用户状态变更', p_id::text || ' -> ' || p_status);
end;
$$;

create or replace function public.admin_set_role(p_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '无权限操作'; end if;
  if p_role not in ('contestant','admin','sub_admin','questioner','proctor','statistician') then
    raise exception '角色不合法';
  end if;
  update public.profiles set role = p_role where id = p_id;
  perform public.log_action('角色变更', p_id::text || ' -> ' || p_role);
end;
$$;

create or replace function public.admin_reset_password(p_id uuid, p_new_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception '无权限操作'; end if;
  if length(p_new_password) < 6 then raise exception '新密码至少 6 位'; end if;
  update auth.users
     set encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   where id = p_id;
  perform public.log_action('重置密码', p_id::text);
end;
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '无权限操作'; end if;
  if exists (select 1 from public.profiles where id = p_id and role in ('admin','sub_admin')) then
    raise exception '不能删除管理员账号';
  end if;
  delete from auth.users where id = p_id;
  perform public.log_action('删除账号', p_id::text);
end;
$$;

-- ----------------------------------------------------------------------------
-- 14. 证书签发 RPC
-- ----------------------------------------------------------------------------
create or replace function public.issue_certificate(
  p_user_id uuid, p_competition_id uuid, p_attempt_id uuid, p_score numeric, p_rank integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_serial text; v_id uuid;
begin
  if not public.is_staff() then raise exception '无权限操作'; end if;
  v_serial := 'CERT-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6));
  insert into public.certificates (user_id, competition_id, attempt_id, serial_no, score, rank_no)
  values (p_user_id, p_competition_id, p_attempt_id, v_serial, p_score, p_rank)
  on conflict (user_id, competition_id) do update
     set serial_no = excluded.serial_no, score = excluded.score, rank_no = excluded.rank_no, issued_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'serial_no', v_serial);
end;
$$;

alter table public.attempts add column if not exists competition_id uuid references public.competitions(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 15b. 基于赛事表的 v2 抽题 / 判分函数（旧函数保留兼容）
-- ----------------------------------------------------------------------------
create or replace function public.start_exam_v2()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.competitions%rowtype;
  v_attempt public.attempts%rowtype;
  v_questions jsonb;
  v_remaining integer;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  if public.is_banned() then raise exception '账号已被禁用，请联系组委会'; end if;

  select * into v_comp from public.competitions
   where status = 'open'
   order by updated_at desc limit 1;
  if not found then raise exception '答题入口尚未开放'; end if;
  if v_comp.start_at is not null and now() < v_comp.start_at then
    raise exception '答题尚未开始，请于 % 后进入', to_char(v_comp.start_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI');
  end if;
  if v_comp.end_at is not null and now() > v_comp.end_at then
    raise exception '答题已结束';
  end if;

  if not exists (select 1 from public.registrations r where r.user_id = v_uid) then
    raise exception '请先在选手中心完成报名，再进入答题';
  end if;

  select * into v_attempt from public.attempts
   where user_id = v_uid order by started_at desc limit 1;
  if found then
    if v_attempt.status = 'submitted' then raise exception '你已提交本次答卷，不可重复答题'; end if;
    v_remaining := v_comp.duration_minutes * 60
                   - floor(extract(epoch from (now() - v_attempt.started_at)))::int;
    if v_remaining > 0 then
      return jsonb_build_object('attempt_id', v_attempt.id, 'questions', v_attempt.questions,
        'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_remaining, 'resumed', true,
        'competition_id', v_comp.id, 'competition_title', v_comp.title);
    else
      raise exception '本次答题时间已结束，请联系管理员处理';
    end if;
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_questions
  from (
    select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',q.score) as t
    from public.questions q where q.is_active
    order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at
    limit greatest(v_comp.question_count,1)
  ) s;

  if jsonb_array_length(v_questions) = 0 then raise exception '题库暂无可用题目，请联系管理员导入'; end if;

  insert into public.attempts (user_id, competition_id, questions, started_at, status)
  select v_uid, v_comp.id, v_questions, now(), 'in_progress'
  from public.profiles where id = v_uid
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'questions', v_questions,
    'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_comp.duration_minutes*60,
    'resumed', false, 'competition_id', v_comp.id, 'competition_title', v_comp.title);
end;
$$;

create or replace function public.submit_exam_v2(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_q jsonb; v_qid uuid; v_qtype text; v_qscore numeric; v_qanswer jsonb; v_analysis text := '';
  v_user_arr text[] := '{}'; v_corr_arr text[] := '{}'; v_user_raw jsonb;
  v_is_correct boolean := false; v_detail jsonb := '[]'::jsonb;
  v_score numeric := 0; v_total numeric := 0; v_correct integer := 0; v_count integer := 0; v_duration integer := 0;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  if public.is_banned() then raise exception '账号已被禁用'; end if;

  select * into v_attempt from public.attempts
   where user_id = v_uid and status = 'in_progress' order by started_at desc limit 1;
  if not found then raise exception '没有进行中的答题，请从答题入口重新进入'; end if;

  for v_q in select value from jsonb_array_elements(v_attempt.questions) loop
    v_count := v_count + 1;
    v_qid := (v_q ->> 'id')::uuid; v_qtype := v_q ->> 'qtype';
    v_qanswer := null; v_qscore := 0; v_analysis := '';
    select q.answer, q.score, q.analysis into v_qanswer, v_qscore, v_analysis from public.questions q where q.id = v_qid;
    if v_qanswer is null then v_qanswer := '[]'::jsonb; v_qscore := 0; v_analysis := ''; end if;
    v_total := v_total + v_qscore;

    v_user_raw := coalesce(p_answers -> (v_qid::text), 'null'::jsonb);
    v_user_arr := '{}';
    if jsonb_typeof(v_user_raw) = 'array' then
      select coalesce(array_agg(public.norm_answer(e)) filter (where public.norm_answer(e) <> ''), '{}')
        into v_user_arr from jsonb_array_elements_text(v_user_raw) as t(e);
    elsif jsonb_typeof(v_user_raw) in ('string','number') then
      if public.norm_answer(v_user_raw #>> '{}') <> '' then
        v_user_arr := array[public.norm_answer(v_user_raw #>> '{}')];
      end if;
    end if;

    select coalesce(array_agg(public.norm_answer(x) order by ord), '{}') into v_corr_arr
      from jsonb_array_elements_text(v_qanswer) with ordinality as t(x, ord);

    if coalesce(cardinality(v_user_arr),0) <> cardinality(v_corr_arr) then
      v_is_correct := false;
    elsif v_qtype = 'fill' then
      v_is_correct := v_corr_arr = v_user_arr;
    else
      v_is_correct :=
        (select coalesce(array_agg(a order by a),'{}') from unnest(v_corr_arr) as a) =
        (select coalesce(array_agg(b order by b),'{}') from unnest(v_user_arr) as b);
    end if;

    if v_is_correct then v_score := v_score + v_qscore; v_correct := v_correct + 1; end if;

    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'id', v_qid, 'qtype', v_qtype, 'content', v_q ->> 'content',
      'options', coalesce(v_q -> 'options','[]'::jsonb), 'score', v_qscore,
      'correct_answer', v_qanswer, 'user_answer', v_user_raw,
      'is_correct', v_is_correct, 'analysis', v_analysis));
  end loop;

  v_duration := greatest(0, floor(extract(epoch from (now() - v_attempt.started_at)))::int);

  update public.attempts set answers = coalesce(p_answers,'{}'::jsonb), detail = v_detail,
    score = v_score, total_score = v_total, correct_count = v_correct, question_count = v_count,
    duration_seconds = v_duration, submitted_at = now(), status = 'submitted'
   where id = v_attempt.id;

  return jsonb_build_object('attempt_id', v_attempt.id, 'score', v_score, 'total_score', v_total,
    'correct_count', v_correct, 'question_count', v_count, 'duration_seconds', v_duration, 'detail', v_detail);
end;
$$;

grant execute on function public.start_exam_v2() to authenticated;
grant execute on function public.submit_exam_v2(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 15. 行级安全：新表 + 旧表策略补齐
-- ----------------------------------------------------------------------------
alter table public.question_categories enable row level security;
alter table public.competitions        enable row level security;
alter table public.announcements       enable row level security;
alter table public.appeals             enable row level security;
alter table public.messages            enable row level security;
alter table public.certificates        enable row level security;
alter table public.cheat_events        enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.app_settings        enable row level security;

-- 分类：所有人可读，仅 staff 写
drop policy if exists cat_read  on public.question_categories;
create policy cat_read  on public.question_categories for select using (true);
drop policy if exists cat_write on public.question_categories;
create policy cat_write on public.question_categories for all using (public.is_staff()) with check (public.is_staff());

-- 赛事：所有人可读，仅 staff 写
drop policy if exists comp_read  on public.competitions;
create policy comp_read  on public.competitions for select using (true);
drop policy if exists comp_write on public.competitions;
create policy comp_write on public.competitions for all using (public.is_staff()) with check (public.is_staff());

-- 公告：已发布全员可读；staff 可写
drop policy if exists ann_read  on public.announcements;
create policy ann_read  on public.announcements for select using (is_published = true or public.is_staff());
drop policy if exists ann_write on public.announcements;
create policy ann_write on public.announcements for all using (public.is_staff()) with check (public.is_staff());

-- 申诉：本人读写；staff 可读可改
drop policy if exists appeal_self  on public.appeals;
create policy appeal_self  on public.appeals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists appeal_staff on public.appeals;
create policy appeal_staff on public.appeals for select using (public.is_staff());

-- 消息：本人读写
drop policy if exists msg_self on public.messages;
create policy msg_self on public.messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 证书：本人可读；staff 写
drop policy if exists cert_self  on public.certificates;
create policy cert_self  on public.certificates for select using (user_id = auth.uid());
drop policy if exists cert_staff on public.certificates;
create policy cert_staff on public.certificates for all using (public.is_staff()) with check (public.is_staff());

-- 作弊记录：本人可写可读；staff 可读
drop policy if exists cheat_self  on public.cheat_events;
create policy cheat_self  on public.cheat_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cheat_staff on public.cheat_events;
create policy cheat_staff on public.cheat_events for select using (public.is_staff());

-- 审计日志：仅 staff 可读；写入只走 RPC
drop policy if exists log_staff on public.audit_logs;
create policy log_staff on public.audit_logs for select using (public.is_staff());

-- 系统设置：全员可读；staff 写
drop policy if exists set_read  on public.app_settings;
create policy set_read  on public.app_settings for select using (true);
drop policy if exists set_write on public.app_settings;
create policy set_write on public.app_settings for all using (public.is_staff()) with check (public.is_staff());

-- profiles 策略补齐：staff 可读全部；封禁状态下本人可读
drop policy if exists profiles_staff on public.profiles;
create policy profiles_staff on public.profiles for select using (public.is_staff());

-- 旧 questions 策略允许 questioner 角色
drop policy if exists questions_admin on public.questions;
create policy questions_admin on public.questions for all using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 16. 函数授权
-- ----------------------------------------------------------------------------
revoke all on function public.log_action(text,text)              from public, anon;
revoke all on function public.record_cheat(text,text)            from public, anon;
revoke all on function public.submit_appeal(text,text,uuid,uuid) from public, anon;
revoke all on function public.staff_reply_appeal(uuid,text,text) from public, anon;
revoke all on function public.admin_set_status(uuid,text,text)   from public, anon;
revoke all on function public.admin_set_role(uuid,text)          from public, anon;
revoke all on function public.admin_reset_password(uuid,text)    from public, anon;
revoke all on function public.admin_delete_user(uuid)            from public, anon;
revoke all on function public.issue_certificate(uuid,uuid,uuid,numeric,integer) from public, anon;

grant execute on function public.log_action(text,text)              to authenticated;
grant execute on function public.record_cheat(text,text)            to authenticated;
grant execute on function public.submit_appeal(text,text,uuid,uuid) to authenticated;
grant execute on function public.staff_reply_appeal(uuid,text,text) to authenticated;
grant execute on function public.admin_set_status(uuid,text,text)   to authenticated;
grant execute on function public.admin_set_role(uuid,text)          to authenticated;
grant execute on function public.admin_reset_password(uuid,text)    to authenticated;
grant execute on function public.admin_delete_user(uuid)            to authenticated;
grant execute on function public.issue_certificate(uuid,uuid,uuid,numeric,integer) to authenticated;
grant execute on function public.is_staff()                         to authenticated;
grant execute on function public.is_banned()                        to authenticated;

-- 初始分类（可选种子）
insert into public.question_categories (name, sort_no) values
  ('宪法总纲',1),('公民权利与义务',2),('国家机构',3),('宪法修正案',4),('其他',9)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 17. 排行榜 RPC：取每人最佳一次正式成绩，公开排名字段（不含答案）
-- ----------------------------------------------------------------------------
create or replace function public.get_leaderboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_out
  from (
    select a.user_id, p.full_name, p.department, p.class_name,
           a.score, a.total_score, a.correct_count, a.question_count, a.duration_seconds
    from public.attempts a
    left join public.profiles p on p.id = a.user_id
    where a.status = 'submitted'
    order by a.score desc, a.duration_seconds asc
    limit 200
  ) t;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.get_leaderboard() to authenticated;

-- ----------------------------------------------------------------------------
-- 18. 旧表补齐：staff 可读全部答卷与报名记录（监考 / 成绩 / 看板需要）
-- ----------------------------------------------------------------------------
drop policy if exists attempts_staff on public.attempts;
create policy attempts_staff on public.attempts for select using (public.is_staff());

drop policy if exists registrations_staff on public.registrations;
create policy registrations_staff on public.registrations for select using (public.is_staff());

-- ----------------------------------------------------------------------------
-- 19. 档案：staff 可写（后台新增账号 / 资料补全）；选手仅可改本人非角色字段
-- ----------------------------------------------------------------------------
drop policy if exists profiles_staff_write on public.profiles;
create policy profiles_staff_write on public.profiles
  for all using (public.is_staff()) with check (public.is_staff());
