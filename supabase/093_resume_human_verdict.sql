-- ============================================================================
-- Adds resumes.human_verdict — staff's own Yes/Maybe/No call, kept separate
-- from ai_verdict (the AI screener's own judgment) so one never overwrites
-- the other. Plain text + check constraint, not an enum, matching the
-- rsvp_status/job_stability precedent for a small fixed set of values —
-- no separate "add value" migration dance needed for something this size.
--
-- Run this in the Supabase SQL Editor AFTER 092.
-- ============================================================================

alter table public.resumes
  add column if not exists human_verdict text check (human_verdict in ('yes', 'maybe', 'no'));
