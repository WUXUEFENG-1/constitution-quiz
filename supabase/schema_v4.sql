-- ============================================================================
-- v4 增量迁移：正式竞赛按题型固定配比组卷 + 多选部分计分 + 本场切屏上限
-- 配比：单选 50×1 分；多选 20×1.5 分（全对 1.5，部分选对 1，有错 0）；
--       判断 10×1 分；填空 5×2 分。题库某类不足时按实际可用题量抽取。
-- 可重复执行（create or replace）。执行前请确认已跑过 schema_v2 / v3。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 开始答题：按题型配比组卷，返回本场切屏上限
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
        'competition_id', v_comp.id, 'competition_title', v_comp.title,
        'switch_limit', coalesce(v_comp.switch_limit, 3));
    else
      raise exception '本次答题时间已结束，请联系管理员处理';
    end if;
  end if;

  -- 按题型固定配比抽题；打乱与否沿用赛事 shuffle 设置
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_questions
  from (
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1) as t
       from public.questions q where q.is_active and q.qtype = 'single'
       order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at limit 50)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1.5) as t
       from public.questions q where q.is_active and q.qtype = 'multiple'
       order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at limit 20)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',1) as t
       from public.questions q where q.is_active and q.qtype = 'judge'
       order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at limit 10)
    union all
    (select jsonb_build_object('id',q.id,'qtype',q.qtype,'content',q.content,'options',q.options,'score',2) as t
       from public.questions q where q.is_active and q.qtype = 'fill'
       order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at limit 5)
  ) s;

  if jsonb_array_length(v_questions) = 0 then raise exception '题库暂无可用题目，请联系管理员导入'; end if;

  insert into public.attempts (user_id, competition_id, questions, started_at, status)
  select v_uid, v_comp.id, v_questions, now(), 'in_progress'
  from public.profiles where id = v_uid
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'questions', v_questions,
    'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_comp.duration_minutes*60,
    'resumed', false, 'competition_id', v_comp.id, 'competition_title', v_comp.title,
    'switch_limit', coalesce(v_comp.switch_limit, 3));
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. 交卷判分：多选部分计分；其余题型全对得分，按题型配比赋分
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

    -- 题型配比满分：单选 1 / 多选 1.5 / 判断 1 / 填空 2
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
        v_earned := 1; v_is_correct := false;  -- 部分选对：得 1 分
      end if;
    elsif v_qtype = 'fill' then
      v_is_correct := v_corr_arr = v_user_arr;
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
