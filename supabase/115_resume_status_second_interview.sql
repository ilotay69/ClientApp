-- ============================================================================
-- Adds "second_interview" to resume_status, between "interviewing" and
-- "rejected" — for a candidate moving on to a second round after the first
-- interview. Plain ADD VALUE ... AFTER is enough here (unlike 074/087)
-- since this only adds one new value rather than renaming or removing any
-- existing ones.
--
-- Postgres requires a brand-new enum value to be committed before it can be
-- used in a query (error 55P04) — this file must run on its own, in its own
-- transaction, same as every other "add value" migration in this project.
--
-- Run this in the Supabase SQL Editor AFTER 114, and BEFORE 116 (which adds
-- "both_done" after this one).
-- ============================================================================

alter type public.resume_status add value if not exists 'second_interview' after 'interviewing';
