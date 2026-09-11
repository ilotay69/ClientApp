-- ============================================================================
-- Whether the candidate's MOST RECENT job is located in Canada or outside
-- it — judged by that job's own stated location, not the candidate's
-- personal address or any earlier job. A plain boolean, same as in_gta.
--
-- Run this in the Supabase SQL Editor AFTER 084.
-- ============================================================================

alter table public.resumes add column if not exists last_job_in_canada boolean;
