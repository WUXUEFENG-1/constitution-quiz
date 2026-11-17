-- ============================================================
-- v8：超时兜底收卷 + 答题进度云端暂存 + 续答回填
-- 1) save_progress：答题过程中把草稿答案存到后端答卷（不判分、不改状态），
--    换设备 / 清缓存后返回仍可续答。
-- 2) flush_expired_attempts：把已超过本场时长、仍滞留 in_progress 的答卷
--    强制收卷（按 0 分记），避免关页面 / 进程被杀后答卷永远挂起。
-- 3) start_exam_v2：恢复作答时回填云端草稿；超时残留先收卷再提示。
-- 4) submit_exam_v2：返回 timed_out 标记，便于前端区分主动交卷 / 超时收卷。
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可，可重复执行。
-- ============================================================

-- ----------------------------------------------------------------------------
-- 1. 保存答题草稿（本人进行中答卷）
-- ----------------------------------------------------------------------------
create or replace function public.save_progress(p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_attempt uuid;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  select id into v_attempt from public.attempts
   where user_id = v_uid and status = 'in_progress'
   order by started_at desc limit 1;
  if v_attempt is null then return; end if;
  update public.attempts
     set answers = coalesce(p_answers, '{}'::jsonb)
   where id = v_attempt;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. 超时兜底收卷：扫描所有超过本场时长仍 in_progress 的答卷，强制提交
-- ----------------------------------------------------------------------------
create or replace function public.flush_expired_attempts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_dur integer;
  v_cnt integer := 0;
begin
  for v_row in
    select a.*, c.duration_minutes
      from public.attempts a
      left join public.competitions c on c.id = a.competition_id
     where a.status = 'in_progress'
  loop
    v_dur := coalesce(v_row.duration_minutes, 30) * 60;
    if now() > v_row.started_at + make_interval(secs => v_dur) then
      update public.attempts
         set status = 'submitted',
             question_count = jsonb_array_length(coalesce(v_row.questions, '[]'::jsonb)),
             duration_seconds = greatest(0, floor(extract(epoch from (now() - v_row.started_at)))::int),
             submitted_at = now()
       where id = v_row.id;
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. 开始 / 续答：回填云端草稿；超时残留先收卷
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
        'answers', coalesce(v_attempt.answers, '{}'::jsonb),
        'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_remaining, 'resumed', true,
        'competition_id', v_comp.id, 'competition_title', v_comp.title,
        'switch_limit', coalesce(v_comp.switch_limit, 3));
    else
      -- 超时残留：先兜底收卷，再提示时间已结束
      update public.attempts
         set status = 'submitted',
             question_count = jsonb_array_length(coalesce(v_attempt.questions, '[]'::jsonb)),
             duration_seconds = greatest(0, floor(extract(epoch from (now() - v_attempt.started_at)))::int),
             submitted_at = now()
       where id = v_attempt.id;
      raise exception '本次答题时间已结束，请联系管理员处理';
    end if;
  end if;

  -- 按题型固定配比抽题；在各题型题库内随机抽取
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_questions
  from (
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1) as t
       from public.questions q where q.is_active and q.qtype = 'single'
       order by random() limit 50)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1.5) as t
       from public.questions q where q.is_active and q.qtype = 'multiple'
       order by random() limit 20)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1) as t
       from public.questions q where q.is_active and q.qtype = 'judge'
       order by random() limit 10)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',2) as t
       from public.questions q where q.is_active and q.qtype = 'fill'
       order by random() limit 5)
  ) s;

  if jsonb_array_length(v_questions) = 0 then raise exception '题库暂无可用题目，请联系管理员导入'; end if;

  insert into public.attempts (user_id, competition_id, questions, started_at, status)
  select v_uid, v_comp.id, v_questions, now(), 'in_progress'
  from public.profiles where id = v_uid
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'questions', v_questions,
    'answers', '{}'::jsonb,
    'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_comp.duration_minutes*60,
    'resumed', false, 'competition_id', v_comp.id, 'competition_title', v_comp.title,
    'switch_limit', coalesce(v_comp.switch_limit, 3));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. 交卷判分：返回 timed_out（是否超时收卷）
-- ----------------------------------------------------------------------------
create or replace function public.submit_exam_v2(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_q jsonb; v_qid uuid; v_qtype text; v_qscore numeric; v_qanswer jsonb; v_analysis text := '';
  v_user_arr text[] := '{}'; v_corr_arr text[] := '{}'; v_user_raw jsonb;
  v_is_correct boolean := false; v_detail jsonb := '[]'::jsonb;
  v_has_wrong boolean; v_earned numeric;
  v_score numeric := 0; v_total numeric := 0; v_correct integer := 0; v_count integer := 0; v_duration integer := 0;
  v_time_limit integer; v_timed_out boolean := false;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  if public.is_banned() then raise exception '账号已被禁用'; end if;

  select * into v_attempt from public.attempts
   where user_id = v_uid and status = 'in_progress' order by started_at desc limit 1;
  if not found then raise exception '没有进行中的答题，请从答题入口重新进入'; end if;

  for v_q in select value from jsonb_array_elements(v_attempt.questions) loop
    v_count := v_count + 1;
    v_qid := (v_q ->> 'id')::uuid; v_qtype := v_q ->> 'qtype';
    v_qanswer := null; v_analysis := '';
    select q.answer, q.analysis into v_qanswer, v_analysis from public.questions q where q.id = v_qid;
    if v_qanswer is null then v_qanswer := '[]'::jsonb; v_analysis := ''; end if;

    v_qscore := case v_qtype
      when 'single' then 1
      when 'multiple' then 1.5
      when 'judge' then 1
      when 'fill' then 2
      else coalesce((v_q ->> 'score')::numeric, 0)
    end;
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

    v_is_correct := false; v_earned := 0;

    if cardinality(v_user_arr) = 0 then
      v_is_correct := false; v_earned := 0;
    elsif v_qtype = 'multiple' then
      v_has_wrong := exists (select 1 from unnest(v_user_arr) as m where m not in (select x from unnest(v_corr_arr) as x));
      if v_has_wrong then
        v_earned := 0; v_is_correct := false;
      elsif cardinality(v_user_arr) = cardinality(v_corr_arr) then
        v_earned := v_qscore; v_is_correct := true;
      else
        v_earned := 1; v_is_correct := false;
      end if;
    elsif v_qtype = 'fill' then
      v_is_correct := cardinality(v_user_arr) > 0
        and not exists (select 1 from unnest(v_user_arr) u
                        where u not in (select x from unnest(v_corr_arr) x));
      v_earned := case when v_is_correct then v_qscore else 0 end;
    else
      v_is_correct :=
        (select coalesce(array_agg(a order by a),'{}') from unnest(v_corr_arr) as a) =
        (select coalesce(array_agg(b order by b),'{}') from unnest(v_user_arr) as b);
      v_earned := case when v_is_correct then v_qscore else 0 end;
    end if;

    v_score := v_score + v_earned;
    if v_is_correct then v_correct := v_correct + 1; end if;

    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'id', v_qid, 'qtype', v_qtype, 'content', v_q ->> 'content',
      'options', coalesce(v_q -> 'options','[]'::jsonb), 'score', v_qscore, 'earned', v_earned,
      'correct_answer', v_qanswer, 'user_answer', v_user_raw,
      'is_correct', v_is_correct, 'analysis', v_analysis));
  end loop;

  v_duration := greatest(0, floor(extract(epoch from (now() - v_attempt.started_at)))::int);

  select coalesce(c.duration_minutes, 30) into v_time_limit
    from public.competitions c where c.id = v_attempt.competition_id;
  v_timed_out := now() > v_attempt.started_at + make_interval(secs => coalesce(v_time_limit, 30) * 60);

  update public.attempts set answers = coalesce(p_answers,'{}'::jsonb), detail = v_detail,
    score = v_score, total_score = v_total, correct_count = v_correct, question_count = v_count,
    duration_seconds = v_duration, submitted_at = now(), status = 'submitted'
   where id = v_attempt.id;

  return jsonb_build_object('attempt_id', v_attempt.id, 'score', v_score, 'total_score', v_total,
    'correct_count', v_correct, 'question_count', v_count, 'duration_seconds', v_duration,
    'timed_out', v_timed_out, 'detail', v_detail);
end;
$$;

grant execute on function public.save_progress(jsonb) to authenticated;
grant execute on function public.flush_expired_attempts() to authenticated;
grant execute on function public.start_exam_v2() to authenticated;
grant execute on function public.submit_exam_v2(jsonb) to authenticated;
