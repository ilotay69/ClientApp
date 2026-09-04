-- CG Technologies Client Tracker — store NinjaOne's device "created"
-- timestamp (confirmed field on NinjaOne's own Device schema, separate
-- from lastContact) so aging-hardware reporting doesn't need a live
-- re-fetch. Existing synced devices get this filled in on their next sync.
alter table public.ninjaone_devices add column if not exists device_created_at timestamptz;
