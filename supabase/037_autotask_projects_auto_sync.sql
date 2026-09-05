-- CG Technologies Client Tracker — tracks when the full Autotask projects
-- sync (tickets/contract-services/Project-SLA, across every mapped
-- client) last ran, so visiting the Projects page can trigger it
-- automatically but throttled, instead of requiring a manual "Sync
-- Autotask" click every time.
alter table public.autotask_settings add column if not exists projects_last_synced_at timestamptz;
