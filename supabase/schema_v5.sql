-- ============================================================
-- v5：公告支持附件（PDF / Word / Excel / 图片等）
-- attachments 为 JSON 数组字符串，元素结构：
--   { "name": "文件名", "type": "MIME", "size": 字节, "data": "data:<mime>;base64,..." }
-- 在 Supabase Studio → SQL 编辑器执行本脚本即可。
-- ============================================================

alter table public.announcements
  add column if not exists attachments text;

comment on column public.announcements.attachments is '公告附件 JSON 数组（base64 data URL），为空表示无附件';

-- 既有读写策略不变：管理员可读写，选手仅可见已发布公告。
