-- ============================================================================
-- Shrinks resume_status from 5 values (new/reviewing/contacted/rejected/
-- hired) down to just 2 (new/reviewed) — the recruitment pipeline turned
-- out not to need the extra granularity in practice. Postgres has no
-- ALTER TYPE ... DROP VALUE, so this rebuilds the enum: widen the column to
-- text, fold every non-"new" row into "reviewed", drop and recreate the
-- type with just the two values, then narrow the column back.
--
-- Recruitment is brand-new this session, so in practice every row today is
-- almost certainly still "new" — this UPDATE is a safety net, not an
-- expected data change, but run it as-is regardless in case any row was
-- manually moved to reviewing/contacted/rejected/hired already.
--
-- Run this in the Supabase SQL Editor AFTER 073.
-- ============================================================================

alter table public.resumes alter column status drop default;
alter table public.resumes alter column status type text using status::text;

update public.resumes set status = 'reviewed' where status in ('reviewing', 'contacted', 'rejected', 'hired');

drop type public.resume_status;
create type public.resume_status as enum ('new', 'reviewed');

alter table public.resumes
  alter column status type public.resume_status using status::public.resume_status,
  alter column status set default 'new',
  alter column status set not null;
