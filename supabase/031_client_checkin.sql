-- CG Technologies Client Tracker — a lightweight "Check-in" Timeline entry:
-- logging one means "I contacted this client" (the entry itself, dated
-- now, is that record) plus a required next-contact date and brief notes.
-- That next-contact date also creates a matching Touchpoint (type
-- monthly_visit, the closest existing fit), so it surfaces in the
-- Touchpoints reminders list too, not just this client's Timeline.
--
-- New value can't be used in the same script that adds it (Postgres
-- 55P04), so this migration only adds it — the app uses it afterward.
alter type public.client_interaction_type add value if not exists 'check_in';

alter table public.client_interactions add column if not exists next_contact_date date;

-- Traceable, one-way link back to the check-in that created it — matches
-- this schema's existing convention for auto-created records (e.g.
-- tasks.source_touchpoint_id, projects.source_autotask_ticket_id). No
-- cascade/sync behavior beyond this: deleting one side leaves the other
-- alone (source set to null), same as those other links.
alter table public.touchpoints
  add column if not exists source_client_interaction_id uuid
  references public.client_interactions (id) on delete set null;
