-- ============================================================================
-- Three extra AI-extracted screening signals, alongside verdict/comment:
-- big_firm_experience (does their most recent employer look like a
-- company with more than 500 employees), years_experience (a rough total
-- years-of-experience estimate read off the work history), and
-- currently_working (does their most recent job look still-current, e.g.
-- no end date / "present"). All nullable, same as ai_verdict/ai_comment —
-- set once screening actually runs.
--
-- Run this in the Supabase SQL Editor AFTER 072.
-- ============================================================================

alter table public.resumes
  add column if not exists big_firm_experience boolean,
  add column if not exists years_experience integer,
  add column if not exists currently_working boolean;
