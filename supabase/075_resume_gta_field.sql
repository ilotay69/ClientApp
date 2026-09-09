-- ============================================================================
-- One more AI-extracted screening signal: in_gta — is the candidate located
-- in the Greater Toronto Area, read from whatever city is stated (their own
-- address, or failing that, their most recent job's location). Null when no
-- city is mentioned anywhere, same "don't guess" rule as the other signals.
--
-- Run this in the Supabase SQL Editor AFTER 074.
-- ============================================================================

alter table public.resumes
  add column if not exists in_gta boolean;
