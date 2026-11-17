-- ============================================================
-- v7：作弊 / 异常行为类型扩充
-- 新增 fullscreen（退出全屏）、resize（窗口缩放）两类切屏行为，
-- 放宽 cheat_events.kind 的 CHECK 枚举约束。
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可，可重复执行。
-- ============================================================

alter table public.cheat_events
  drop constraint if exists cheat_events_kind_check;

alter table public.cheat_events
  add constraint cheat_events_kind_check
  check (kind in ('switch','blur','copy','focus_lost','violation','fullscreen','resize'));
