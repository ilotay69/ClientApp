-- ============================================================================
-- Two new fields on a quarterly review:
--
-- summary — a short, editable, client-facing summary shown at the top of
-- the review (labeled just "Summary" in the UI). Starts as an AI draft
-- (see generateQuarterlyReviewSummaryAction) but staff can freely rewrite
-- it if they don't like the AI's version — this column always holds
-- whatever the CURRENT text is, not a history of drafts. Included in the
-- client email.
--
-- hours_spent — purely internal time tracking, visible on the review page
-- and in the reviews list, NEVER included in anything sent to the client
-- (buildQuarterlyReviewClientEmail's signature simply has no parameter for
-- it, so there's no code path that could leak it by accident).
--
-- Run this in the Supabase SQL Editor AFTER 103.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists summary text,
  add column if not exists hours_spent numeric(6, 2);
