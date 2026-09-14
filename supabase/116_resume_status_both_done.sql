-- ============================================================================
-- Adds "both_done" to resume_status, right after "second_interview" — for a
-- candidate who's finished both interview rounds and is just waiting on a
-- hire/reject decision.
--
-- Postgres requires a brand-new enum value to be committed before it can be
-- used in a query (error 55P04) — this file must run on its own, in its own
-- transaction, same as every other "add value" migration in this project.
--
-- Run this in the Supabase SQL Editor AFTER 115.
-- ============================================================================

alter type public.resume_status add value if not exists 'both_done' after 'second_interview';
