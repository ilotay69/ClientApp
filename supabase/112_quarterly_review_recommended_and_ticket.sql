-- ============================================================================
-- Two small additions to quarterly reviews:
--
-- 1. A 5th item status, "recommended" — alongside Healthy/Need Attention/
--    Need Urgent Attention/N/A, for something worth suggesting (e.g. an
--    upgrade) that isn't a health problem. This is a plain CHECK
--    constraint (not an enum), so — unlike permission_key/reminder_kind
--    elsewhere in this app — it can be widened in the same migration that
--    will later use it; no 55P04 same-transaction restriction applies.
--
-- 2. ticket_number — free text, references an Autotask ticket this review
--    relates to. Same internal-only posture as hours_spent: never passed
--    to buildQuarterlyReviewClientEmail/buildQuarterlyReviewPdf.
--
-- Run this in the Supabase SQL Editor AFTER 111.
-- ============================================================================

alter table public.quarterly_review_items drop constraint if exists quarterly_review_items_status_check;
alter table public.quarterly_review_items
  add constraint quarterly_review_items_status_check
  check (status in ('healthy', 'attention', 'urgent', 'na', 'recommended'));

alter table public.quarterly_reviews
  add column if not exists ticket_number text;
