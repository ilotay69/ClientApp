-- ============================================================================
-- Track who actually did each step of a review, not just when it happened.
-- quarterly_reviews already had created_by and approved_by; this adds the
-- two missing ones (submitted_by, sent_by) so the reviews list can show
-- "who's working on it right now" for every status, not just approved.
--
-- Run this in the Supabase SQL Editor AFTER 104.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists submitted_by uuid references public.profiles (id) on delete set null,
  add column if not exists sent_by uuid references public.profiles (id) on delete set null;
