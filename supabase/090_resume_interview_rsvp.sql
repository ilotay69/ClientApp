-- ============================================================================
-- RSVP tracking for scheduled interviews — when a candidate's calendar app
-- sends back an Accept/Decline/Tentative response to the .ics invite,
-- Microsoft Graph surfaces that email as a distinctly-typed message
-- (meetingMessageType: meetingAccepted/meetingDeclined/
-- meetingTentativelyAccepted), not just a plain email — the
-- candidate-messages sync now reads that type and records the result here,
-- instead of it only showing up as an ambiguous line in the Messages
-- thread.
--
-- Run this in the Supabase SQL Editor AFTER 089.
-- ============================================================================

alter table public.resume_interviews
  add column if not exists rsvp_status text check (rsvp_status in ('accepted', 'declined', 'tentative')),
  add column if not exists rsvp_at timestamptz;
