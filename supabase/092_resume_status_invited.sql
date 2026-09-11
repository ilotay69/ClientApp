-- ============================================================================
-- Adds "invited" to resume_status, between "contacting" and "interviewing" —
-- for a candidate who's been sent an interview invite/booking link but
-- hasn't actually had the interview yet. Plain ADD VALUE ... BEFORE is
-- enough here (unlike 074/087) since this only adds one new value rather
-- than renaming or removing any existing ones.
--
-- Postgres requires a brand-new enum value to be committed before it can be
-- used in a query (error 55P04) — this file must run on its own, in its own
-- transaction, same as every other "add value" migration in this project.
--
-- Run this in the Supabase SQL Editor AFTER 091.
-- ============================================================================

alter type public.resume_status add value if not exists 'invited' before 'interviewing';
