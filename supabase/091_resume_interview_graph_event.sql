-- ============================================================================
-- Interview invites now create a real Microsoft Graph calendar event on the
-- shared mailbox's own calendar (with the candidate as an attendee),
-- instead of just emailing a standalone .ics file. graph_event_id
-- remembers which event backs which interview; teams_join_url captures the
-- auto-generated Teams meeting link Graph returns when the event is
-- created with isOnlineMeeting — both nullable, since past interviews
-- scheduled before this change have neither.
--
-- Run this in the Supabase SQL Editor AFTER 090.
-- ============================================================================

alter table public.resume_interviews
  add column if not exists graph_event_id text,
  add column if not exists teams_join_url text;
