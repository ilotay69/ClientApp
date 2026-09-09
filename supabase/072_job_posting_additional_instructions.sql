-- ============================================================================
-- Adds a free-text field on the job posting for extra screening guidance
-- (e.g. "must have a car", "prefer helpdesk experience") beyond the title
-- and description — saved and versioned the same way the posting itself is
-- (job_postings is append-only; a resume's job_posting_id keeps pointing at
-- whichever version it was actually screened against).
--
-- Run this in the Supabase SQL Editor AFTER 071.
-- ============================================================================
alter table public.job_postings
  add column if not exists additional_instructions text;
