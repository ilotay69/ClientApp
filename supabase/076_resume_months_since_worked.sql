-- ============================================================================
-- Pairs with currently_working: when it's false, months_since_worked is
-- roughly how many months since the candidate's most recent job ended
-- (e.g. "No, 15" meaning not working for about 15 months). Null when
-- currently_working is true or genuinely can't be estimated.
--
-- Run this in the Supabase SQL Editor AFTER 075.
-- ============================================================================

alter table public.resumes
  add column if not exists months_since_worked integer;
