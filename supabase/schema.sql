-- ============================================================================
--  云南工业信息职业学院 第二届“学宪法 讲宪法”校园知识竞赛系统
--  数据库结构 / 权限 / 判分函数（Supabase PostgreSQL）
--
--  使用方式：Supabase 控制台 → SQL Editor → 新建查询 → 整段粘贴执行
--  执行顺序：本文件 → seed_questions.sql（题库种子，可选）
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. 选手 / 管理员档案
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  student_no  text not null default '',
  department  text not null default '',
  class_name  text not null default '',
  phone       text not null default '',
  role        text not null default 'contestant' check (role in ('contestant', 'admin')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is '参赛选手与管理员档案，id 与 Supabase Auth 用户一一对应';

-- 注册时自动建档：资料来自 signUp 时传入的 metadata，角色固定为选手（管理员只能由后台 SQL 授予）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, student_no, department, class_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'student_no', ''),
    coalesce(new.raw_user_meta_data ->> 'department', ''),
    coalesce(new.raw_user_meta_data ->> 'class_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. 题库
--    answer 统一用 jsonb 数组：
--      单选 / 判断 → ["A"]（判断 A=正确，B=错误）
--      多选       → ["A","C"]
--      填空       → ["第一个空的答案","第二个空的答案"]
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  qtype       text not null check (qtype in ('single', 'multiple', 'judge', 'fill')),
  content     text not null,
  options     jsonb not null default '[]'::jsonb,
  answer      jsonb not null default '[]'::jsonb,
  analysis    text not null default '',
  score       numeric(6, 2) not null default 2 check (score > 0),
  is_active   boolean not null default true,
  sort_no     integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.questions is '题库；answer 字段仅管理员与服务端判分函数可读';

create index if not exists idx_questions_type on public.questions (qtype);
create index if not exists idx_questions_active on public.questions (is_active);

-- ----------------------------------------------------------------------------
-- 3. 赛事设置（单行表，id 恒为 1）
-- ----------------------------------------------------------------------------
create table if not exists public.exam_settings (
  id                integer primary key default 1,
  is_open           boolean not null default false,
  start_at          timestamptz,
  end_at            timestamptz,
  duration_minutes  integer not null default 30,
  question_count    integer not null default 40,
  shuffle           boolean not null default true,
  note              text not null default '',
  updated_at        timestamptz not null default now()
);
insert into public.exam_settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. 报名记录
-- ----------------------------------------------------------------------------
create table if not exists public.registrations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  full_name   text not null,
  student_no  text not null,
  department  text not null default '',
  class_name  text not null default '',
  phone       text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id)
);

-- ----------------------------------------------------------------------------
-- 5. 答卷（答题开始时即建档，提交时由服务端判分回填）
-- ----------------------------------------------------------------------------
create table if not exists public.attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  full_name         text not null default '',
  student_no        text not null default '',
  department        text not null default '',
  class_name        text not null default '',
  questions         jsonb not null default '[]'::jsonb,  -- 抽题快照（不含答案）
  answers           jsonb not null default '{}'::jsonb,  -- 选手作答
  detail            jsonb not null default '[]'::jsonb,  -- 逐题判分明细
  score             numeric(8, 2) not null default 0,
  total_score       numeric(8, 2) not null default 0,
  correct_count     integer not null default 0,
  question_count    integer not null default 0,
  duration_seconds  integer not null default 0,
  status            text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz
);

-- 每人一次机会；如需允许重答，删除这条唯一约束即可
create unique index if not exists uq_attempts_user on public.attempts (user_id);
create index if not exists idx_attempts_dept on public.attempts (department);

-- ----------------------------------------------------------------------------
-- 6. 权限判定辅助函数
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 填空/选项答案归一化：去空白、转小写、去全角空格
create or replace function public.norm_answer(t text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(t, ''), '[[:space:]　]+', '', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- 7. 开始答题（服务端抽题，题目不含答案）
-- ----------------------------------------------------------------------------
create or replace function public.start_exam()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_settings  public.exam_settings%rowtype;
  v_attempt   public.attempts%rowtype;
  v_questions jsonb;
  v_remaining integer;
  v_name      text := '';
  v_no        text := '';
  v_dept      text := '';
  v_class     text := '';
begin
  if v_uid is null then
    raise exception '请先登录';
  end if;

  select * into v_settings from public.exam_settings where id = 1;

  select coalesce(full_name, ''), coalesce(student_no, ''), coalesce(department, ''), coalesce(class_name, '')
    into v_name, v_no, v_dept, v_class
  from public.profiles
  where id = v_uid;

  -- 必须先完成报名才能进入答题
  if not exists (select 1 from public.registrations r where r.user_id = v_uid) then
    raise exception '请先在选手中心完成报名，再进入答题';
  end if;

  -- 是否已有答卷（续答 / 已提交）
  select * into v_attempt from public.attempts where user_id = v_uid;
  if found then
    if v_attempt.status = 'submitted' then
      raise exception '你已提交本次答卷，不可重复答题';
    end if;
    v_remaining := v_settings.duration_minutes * 60
                   - floor(extract(epoch from (now() - v_attempt.started_at)))::int;
    if v_remaining > 0 then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'questions', v_attempt.questions,
        'duration_minutes', v_settings.duration_minutes,
        'remaining_seconds', v_remaining,
        'resumed', true
      );
    else
      raise exception '本次答题时间已结束，请联系管理员处理';
    end if;
  end if;

  -- 开放时间校验
  if not v_settings.is_open then
    raise exception '答题入口尚未开放';
  end if;
  if v_settings.start_at is not null and now() < v_settings.start_at then
    raise exception '答题尚未开始，请于 % 后再进入', to_char(v_settings.start_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI');
  end if;
  if v_settings.end_at is not null and now() > v_settings.end_at then
    raise exception '答题已结束';
  end if;

  -- 抽题
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_questions
  from (
    select jsonb_build_object(
             'id', q.id, 'qtype', q.qtype, 'content', q.content,
             'options', q.options, 'score', q.score
           ) as t
    from public.questions q
    where q.is_active
    order by case when v_settings.shuffle then random() else 0 end, q.sort_no, q.created_at
    limit greatest(v_settings.question_count, 1)
  ) s;

  if jsonb_array_length(v_questions) = 0 then
    raise exception '题库暂无可用题目，请联系管理员导入';
  end if;

  insert into public.attempts (user_id, full_name, student_no, department, class_name, questions, started_at, status)
  values (v_uid,
          coalesce(v_name, ''),
          coalesce(v_no, ''),
          coalesce(v_dept, ''),
          coalesce(v_class, ''),
          v_questions, now(), 'in_progress')
  returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'questions', v_questions,
    'duration_minutes', v_settings.duration_minutes,
    'remaining_seconds', v_settings.duration_minutes * 60,
    'resumed', false
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. 提交答卷（服务端判分，答案不出数据库）
-- ----------------------------------------------------------------------------
create or replace function public.submit_exam(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_attempt    public.attempts%rowtype;
  v_q          jsonb;
  v_qid        uuid;
  v_qtype      text;
  v_qscore     numeric := 0;
  v_qanswer    jsonb;
  v_analysis   text := '';
  v_user_arr   text[] := '{}';
  v_corr_arr   text[] := '{}';
  v_user_raw   jsonb;
  v_is_correct boolean := false;
  v_detail     jsonb := '[]'::jsonb;
  v_score      numeric := 0;
  v_total      numeric := 0;
  v_correct    integer := 0;
  v_count      integer := 0;
  v_duration   integer := 0;
begin
  if v_uid is null then
    raise exception '请先登录';
  end if;

  select * into v_attempt
  from public.attempts
  where user_id = v_uid and status = 'in_progress'
  order by started_at desc
  limit 1;

  if not found then
    raise exception '没有进行中的答题，请从答题入口重新进入';
  end if;

  for v_q in select value from jsonb_array_elements(v_attempt.questions) loop
    v_count := v_count + 1;
    v_qid   := (v_q ->> 'id')::uuid;
    v_qtype := v_q ->> 'qtype';

    v_qanswer  := null;
    v_qscore   := 0;
    v_analysis := '';

    select q.answer, q.score, q.analysis
      into v_qanswer, v_qscore, v_analysis
    from public.questions q
    where q.id = v_qid;

    if v_qanswer is null then   -- 题目已被删除
      v_qanswer  := '[]'::jsonb;
      v_qscore   := 0;
      v_analysis := '';
    end if;

    v_total := v_total + v_qscore;

    -- 取选手答案并归一化为文本数组
    v_user_raw := coalesce(p_answers -> (v_qid::text), 'null'::jsonb);
    v_user_arr := '{}';
    if jsonb_typeof(v_user_raw) = 'array' then
      select coalesce(array_agg(public.norm_answer(e)) filter (where public.norm_answer(e) <> ''), '{}')
        into v_user_arr
      from jsonb_array_elements_text(v_user_raw) as t(e);
    elsif jsonb_typeof(v_user_raw) in ('string', 'number') then
      if public.norm_answer(v_user_raw #>> '{}') <> '' then
        v_user_arr := array[public.norm_answer(v_user_raw #>> '{}')];
      end if;
    end if;

    -- 标准答案同样归一化（保留原始顺序，供填空题按空位比对）
    select coalesce(array_agg(public.norm_answer(x) order by ord), '{}')
      into v_corr_arr
    from jsonb_array_elements_text(v_qanswer) with ordinality as t(x, ord);

    -- 判分：未作答直接 0 分；填空按空位顺序严格比对；选择/判断按集合比对
    --      多选必须全部选对，少选、多选、错选均不得分
    if coalesce(cardinality(v_user_arr), 0) <> cardinality(v_corr_arr) then
      v_is_correct := false;
    elsif v_qtype = 'fill' then
      v_is_correct := v_corr_arr = v_user_arr;
    else
      v_is_correct :=
        (select coalesce(array_agg(a order by a), '{}') from unnest(v_corr_arr) as a)
        =
        (select coalesce(array_agg(b order by b), '{}') from unnest(v_user_arr) as b);
    end if;

    if v_is_correct then
      v_score := v_score + v_qscore;
      v_correct := v_correct + 1;
    end if;

    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'id', v_qid,
      'qtype', v_qtype,
      'content', v_q ->> 'content',
      'options', coalesce(v_q -> 'options', '[]'::jsonb),
      'score', v_qscore,
      'correct_answer', v_qanswer,
      'user_answer', v_user_raw,
      'is_correct', v_is_correct,
      'analysis', v_analysis
    ));
  end loop;

  v_duration := greatest(0, floor(extract(epoch from (now() - v_attempt.started_at)))::int);

  update public.attempts
     set answers          = coalesce(p_answers, '{}'::jsonb),
         detail           = v_detail,
         score            = v_score,
         total_score      = v_total,
         correct_count    = v_correct,
         question_count   = v_count,
         duration_seconds = v_duration,
         submitted_at     = now(),
         status           = 'submitted'
   where id = v_attempt.id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'score', v_score,
    'total_score', v_total,
    'correct_count', v_correct,
    'question_count', v_count,
    'duration_seconds', v_duration,
    'detail', v_detail
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. 在线练习（带答案与解析，不计成绩）
-- ----------------------------------------------------------------------------
create or replace function public.get_practice_questions(p_count integer default 10, p_type text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    raise exception '请先登录';
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'id', q.id, 'qtype', q.qtype, 'content', q.content, 'options', q.options,
             'answer', q.answer, 'analysis', q.analysis, 'score', q.score
           ) as t
    from public.questions q
    where q.is_active
      and (p_type = '' or p_type is null or q.qtype = p_type)
    order by random()
    limit greatest(least(coalesce(p_count, 10), 50), 1)
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. 行级安全策略：前端只用 anon key，一切靠 RLS 兜底
-- ----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.questions      enable row level security;
alter table public.exam_settings  enable row level security;
alter table public.registrations  enable row level security;
alter table public.attempts       enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() and role = 'contestant')
  with check (id = auth.uid() and role = 'contestant');

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- questions：仅管理员可读写，选手只能通过 start_exam / get_practice_questions 取题
drop policy if exists questions_admin on public.questions;
create policy questions_admin on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- exam_settings：所有人可读开放状态；仅管理员可改
drop policy if exists settings_select on public.exam_settings;
create policy settings_select on public.exam_settings
  for select using (true);

drop policy if exists settings_admin_write on public.exam_settings;
create policy settings_admin_write on public.exam_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- registrations
drop policy if exists registrations_self on public.registrations;
create policy registrations_self on public.registrations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists registrations_admin on public.registrations;
create policy registrations_admin on public.registrations
  for select using (public.is_admin());

-- attempts：选手只能看自己的成绩；写入只允许通过上面的函数
drop policy if exists attempts_self on public.attempts;
create policy attempts_self on public.attempts
  for select using (user_id = auth.uid());

drop policy if exists attempts_admin on public.attempts;
create policy attempts_admin on public.attempts
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. 函数授权：只给已登录用户，匿名不可调用
-- ----------------------------------------------------------------------------
revoke all on function public.start_exam()        from public, anon;
revoke all on function public.submit_exam(jsonb)  from public, anon;
revoke all on function public.get_practice_questions(integer, text) from public, anon;

grant execute on function public.start_exam()        to authenticated;
grant execute on function public.submit_exam(jsonb)  to authenticated;
grant execute on function public.get_practice_questions(integer, text) to authenticated;
grant execute on function public.is_admin()          to authenticated;

-- ----------------------------------------------------------------------------
-- 12. 初始化管理员（按需执行一次）
--   先在网站注册一个账号（学号填 admin，姓名填“系统管理员”），再执行：
--   update public.profiles set role = 'admin' where student_no = 'admin';
-- ----------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where student_no = 'admin';
