-- ============================================================================
-- schema_v13：选手在线练习记录与练习排行
--   practice_records：每次在线练习提交一条（仅练习，不计入正式竞赛成绩）。
--   get_practice_leaderboard：按选手聚合练习次数、最高分、最近一次成绩与正确率，
--   供后台“练习排行”展示；工作人员角色不计入排行。
-- ============================================================================

create table if not exists public.practice_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  full_name         text not null default '',
  student_no        text not null default '',
  department        text not null default '',
  class_name        text not null default '',
  score             numeric(8, 2) not null default 0,
  total_score       numeric(8, 2) not null default 0,
  correct_count     integer not null default 0,
  question_count    integer not null default 0,
  correct_rate      numeric(5, 2) not null default 0,  -- 百分制 0-100
  duration_seconds  integer not null default 0,
  detail            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_practice_user    on public.practice_records (user_id);
create index if not exists idx_practice_created on public.practice_records (created_at desc);

alter table public.practice_records enable row level security;

drop policy if exists practice_self_select on public.practice_records;
create policy practice_self_select on public.practice_records
  for select using (user_id = auth.uid());

drop policy if exists practice_self_insert on public.practice_records;
create policy practice_self_insert on public.practice_records
  for insert with check (user_id = auth.uid());

drop policy if exists practice_staff_select on public.practice_records;
create policy practice_staff_select on public.practice_records
  for select using (public.is_staff());

-- 练习排行聚合 RPC：每人练习次数、历史最高分、最近一次成绩与正确率
create or replace function public.get_practice_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_out
  from (
    select r.user_id,
           p.full_name,
           p.student_no,
           p.department,
           p.class_name,
           count(*)::integer                        as practice_count,
           max(r.score)                             as best_score,
           max(r.total_score)                       as best_total,
           r_last.score                             as last_score,
           r_last.total_score                       as last_total,
           r_last.correct_count                     as last_correct,
           r_last.question_count                    as last_question,
           r_last.correct_rate                      as last_rate,
           r_last.created_at                        as last_at
    from public.practice_records r
    left join public.profiles p on p.id = r.user_id
    left join lateral (
      select rr.score, rr.total_score, rr.correct_count, rr.question_count,
             rr.correct_rate, rr.created_at
      from public.practice_records rr
      where rr.user_id = r.user_id
      order by rr.created_at desc
      limit 1
    ) r_last on true
    where p.role is null
       or p.role not in ('admin','sub_admin','questioner','proctor','statistician')
    group by r.user_id, p.full_name, p.student_no, p.department, p.class_name,
             r_last.score, r_last.total_score, r_last.correct_count,
             r_last.question_count, r_last.correct_rate, r_last.created_at
    order by best_score desc, last_at desc
    limit 300
  ) t;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.get_practice_leaderboard() to authenticated;
