-- ============================================================================
-- Adds content_type to resumes, needed now that sync accepts both PDF and
-- Word (.docx) attachments — screening reads this to decide whether to send
-- the file as a native PDF document block or extract its text first (Claude
-- has no native .docx support; PDF does).
--
-- Run this in the Supabase SQL Editor AFTER 069.
--
-- `not null default 'application/pdf'` rather than nullable: every row
-- inserted by resume-sync.ts from here on always sets this explicitly (the
-- default only exists so this ALTER can never fail against any row that
-- might already exist — it's not something new code relies on).
-- ============================================================================
alter table public.resumes
  add column if not exists content_type text not null default 'application/pdf';
