-- ============================================================================
-- schema_v10：选项乱序
--   抽题时对单选/多选/判断的选项随机排列，并把答案字母按新位置同步重映射，
--   避免正确选项固定在 A。正式卷快照保存重映射后的答案，判分仍按快照比对。
-- ============================================================================

-- 选项重排 + 答案字母重映射辅助函数
create or replace function public.shuffle_options(p_options jsonb, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opts text[];
  v_ans  text[];
  v_correct text[] := '{}';
  v_shuffled text[];
  v_new_ans  text[] := '{}';
  v_letter text; v_idx int; v_pos int; v_o text;
begin
  if p_options is null then
    return jsonb_build_object('options', '[]'::jsonb, 'answer', coalesce(p_answer, '[]'::jsonb));
  end if;

  select coalesce(array_agg(x), '{}') into v_opts
    from jsonb_array_elements_text(p_options) x;
  select coalesce(array_agg(x), '{}') into v_ans
    from jsonb_array_elements_text(p_answer) x;

  if coalesce(array_length(v_opts, 1), 0) < 2 then
    return jsonb_build_object('options', p_options, 'answer', coalesce(p_answer, '[]'::jsonb));
  end if;

  -- 原答案字母 -> 正确选项文本
  foreach v_letter in array v_ans loop
    v_idx := ascii(upper(btrim(v_letter))) - 65;
    if v_idx between 0 and array_length(v_opts, 1) - 1 then
      v_correct := array_append(v_correct, v_opts[v_idx + 1]);
    end if;
  end loop;

  -- 选项随机排列
  select array_agg(opt) into v_shuffled
    from (select opt from unnest(v_opts) opt order by random()) t;

  -- 按新位置重映射答案字母
  for v_pos in 1 .. array_length(v_shuffled, 1) loop
    v_o := v_shuffled[v_pos];
    if v_o = any(v_correct) then
      v_new_ans := array_append(v_new_ans, chr(64 + v_pos));
    end if;
  end loop;

  return jsonb_build_object(
    'options', to_jsonb(v_shuffled),
    'answer',  to_jsonb(v_new_ans)
  );
end;
$$;

-- 练习抽题：选项乱序，返回重映射后的答案供前端判分
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
             'id', q.id, 'qtype', q.qtype, 'content', q.content,
             'options', sh -> 'options', 'answer', sh -> 'answer',
             'analysis', q.analysis, 'score', q.score
           ) as t
    from public.questions q
    cross join lateral public.shuffle_options(q.options, q.answer) sh
    where q.is_active
      and (p_type = '' or p_type is null or q.qtype = p_type)
    order by random()
    limit greatest(least(coalesce(p_count, 10), 50), 1)
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

-- 正式抽题 v2：快照保存乱序后的选项与重映射答案；下发给前端的试卷不含答案
create or replace function public.start_exam_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.competitions%rowtype;
  v_attempt public.attempts%rowtype;
  v_questions_full jsonb;
  v_questions_client jsonb;
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

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_questions_full
  from (
    select jsonb_build_object(
             'id', q.id, 'qtype', q.qtype, 'content', q.content,
             'options', sh -> 'options', 'answer', sh -> 'answer', 'score', q.score
           ) as t
    from public.questions q
    cross join lateral public.shuffle_options(q.options, q.answer) sh
    where q.is_active
    order by case when v_comp.shuffle then random() else 0 end, q.sort_no, q.created_at
    limit greatest(v_comp.question_count, 1)
  ) s;

  if jsonb_array_length(v_questions_full) = 0 then raise exception '题库暂无可用题目，请联系管理员导入'; end if;

  -- 下发给前端的试卷剥离答案
  select coalesce(jsonb_agg(s - 'answer'), '[]'::jsonb) into v_questions_client
    from jsonb_array_elements(v_questions_full) s;

  insert into public.attempts (user_id, competition_id, questions, started_at, status)
  select v_uid, v_comp.id, v_questions_full, now(), 'in_progress'
  from public.profiles where id = v_uid
  returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'questions', v_questions_client,
    'duration_minutes', v_comp.duration_minutes, 'remaining_seconds', v_comp.duration_minutes*60,
    'resumed', false, 'competition_id', v_comp.id, 'competition_title', v_comp.title);
end;
$$;

-- 判分 v2：优先按快照中重映射后的答案比对，缺失时回退题库原始答案
create or replace function public.submit_exam_v2(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

    -- 快照答案（乱序重映射后）优先；否则回退题库原始答案
    if v_q ? 'answer' and jsonb_array_length(coalesce(v_q -> 'answer', '[]'::jsonb)) > 0 then
      v_qanswer := v_q -> 'answer';
      select q.score, q.analysis into v_qscore, v_analysis from public.questions q where q.id = v_qid;
    else
      select q.answer, q.score, q.analysis into v_qanswer, v_qscore, v_analysis
        from public.questions q where q.id = v_qid;
    end if;

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

grant execute on function public.shuffle_options(jsonb, jsonb) to authenticated;
grant execute on function public.get_practice_questions(integer, text) to authenticated;
grant execute on function public.start_exam_v2() to authenticated;
grant execute on function public.submit_exam_v2(jsonb) to authenticated;
