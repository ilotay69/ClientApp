-- ============================================================================
-- Two more editable, client-facing fields on a quarterly review — same
-- pattern as `summary` (104): each can be pre-filled with a "Generate"
-- button from the current checklist, then freely rewritten before it goes
-- out, same as Summary already works. When empty, the PDF falls back to
-- computing them automatically from the checklist instead (see
-- buildQuarterlyReviewPdf) — so a review nobody ever clicked "Generate"
-- on still gets a sensible Action Items / Changes Since Last Review
-- section, and generating just gives a starting point to edit.
--
-- Run this in the Supabase SQL Editor AFTER 112.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists action_items_notes text,
  add column if not exists changes_since_last_review_notes text;
