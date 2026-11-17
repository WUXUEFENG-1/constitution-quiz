-- ============================================================================
-- v3 增量迁移：法治主题改版
-- 1. 竞赛：组卷方式(paper_type)、申诉开关(appeal_enabled)、切屏上限(switch_limit)
-- 2. 申诉：关联竞赛(competition_id)、截图佐证(screenshot, base64 data URL)
-- 3. 题目：法条配图(law_image)
-- 4. 重建 submit_appeal RPC，支持竞赛与截图
-- 5. 首页轮播默认设置
-- 可重复执行（if not exists / 幂等）
-- ============================================================================

-- 1. 竞赛扩展字段
alter table public.competitions
  add column if not exists paper_type     text    not null default 'random'
    check (paper_type in ('fixed','random')),
  add column if not exists appeal_enabled boolean not null default true,
  add column if not exists switch_limit   integer not null default 3;

-- 2. 申诉扩展字段
alter table public.appeals
  add column if not exists competition_id uuid references public.competitions(id) on delete set null,
  add column if not exists screenshot     text;

create index if not exists idx_appeals_comp on public.appeals (competition_id);

-- 3. 题目法条配图
alter table public.questions
  add column if not exists law_image text;

-- 4. 重建申诉提交 RPC（增加竞赛、截图）
create or replace function public.submit_appeal(
  p_kind text,
  p_content text,
  p_qid uuid default null,
  p_attempt_id uuid default null,
  p_competition_id uuid default null,
  p_screenshot text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_kind not in ('question','score') then raise exception '申诉类型不支持'; end if;
  if length(trim(p_content)) < 5 then raise exception '申诉内容至少 5 个字'; end if;

  insert into public.appeals (user_id, attempt_id, qid, competition_id, kind, content, screenshot)
  values (
    auth.uid(),
    p_attempt_id,
    p_qid,
    p_competition_id,
    p_kind,
    trim(p_content),
    case when p_screenshot is null or length(p_screenshot) = 0 then null
         else left(p_screenshot, 500000) end
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

-- 5. 首页轮播默认设置（不存在才写入）
insert into public.app_settings (key, value)
select 'carousel',
       '[{"title":"尊崇宪法 · 学法守法 知法用法","desc":"第二届“学宪法 讲宪法”校园知识竞赛线上答题平台，欢迎参赛。"},
         {"title":"法治校园 · 依宪治国 依宪执政","desc":"学习宪法知识，弘扬法治精神，做尊法学法守法用法的青年学生。"}]'::jsonb
where not exists (select 1 from public.app_settings where key = 'carousel');
