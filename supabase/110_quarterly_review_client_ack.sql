-- ============================================================================
-- Lets a client acknowledge a sent quarterly review (with optional remarks)
-- via a link in the email — no login required, since the client may not
-- have a portal account at all. client_ack_token is a random, unguessable
-- id (crypto.randomUUID() — see sendQuarterlyReviewToClientAction)
-- regenerated on every send, so an old email's link stops working once the
-- review is corrected and resent, and the acknowledgment fields reset for
-- the new round. The public page/action that consumes this token lives
-- outside the staff/portal auth walls entirely (src/app/quarterly-review-ack).
--
-- Run this in the Supabase SQL Editor AFTER 109.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists client_ack_token uuid,
  add column if not exists client_acknowledged_at timestamptz,
  add column if not exists client_ack_remarks text;

create unique index if not exists quarterly_reviews_client_ack_token_idx
  on public.quarterly_reviews (client_ack_token)
  where client_ack_token is not null;
