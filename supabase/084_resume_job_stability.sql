-- ============================================================================
-- Job-stability signal: whether the candidate's employment history (every
-- employer listed, not just the most recent one) shows a pattern of
-- frequent short stints vs. stable, longer tenures — a plain text column
-- ('stable' | 'frequent_changes' | null), same approach as
-- m365_technologies rather than a Postgres enum, so there's no separate
-- "add the enum value" migration needed before this column can be used.
--
-- Run this in the Supabase SQL Editor AFTER 083.
-- ============================================================================

alter table public.resumes add column if not exists job_stability text;
