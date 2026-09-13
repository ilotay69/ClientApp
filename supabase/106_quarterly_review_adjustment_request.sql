-- ============================================================================
-- Lets the approver send a submitted review back for changes instead of
-- just approving it outright — captures their remarks so the person who
-- worked on it can see exactly what needs adjusting. Sending it back moves
-- status back to 'draft' (same as the existing reopen flow) and stores
-- these three fields; approving a review afterwards clears them again,
-- since the adjustment cycle is then closed.
--
-- Run this in the Supabase SQL Editor AFTER 105.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists adjustment_notes text,
  add column if not exists adjustment_requested_at timestamptz,
  add column if not exists adjustment_requested_by uuid references public.profiles (id) on delete set null;
