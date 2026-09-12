-- ============================================================================
-- Lets staff dismiss a message from the top-of-page "Candidate messages"
-- rollup (see recruitment/page.tsx) without affecting anything else — the
-- message itself, and its place in that candidate's own thread under their
-- row, are completely untouched. Purely a per-message "hide from the
-- rollup" flag, not a delete.
--
-- Run this in the Supabase SQL Editor AFTER 097.
-- ============================================================================

alter table public.resume_messages add column if not exists dismissed_at timestamptz;
