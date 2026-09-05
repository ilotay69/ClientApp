-- Tracks the last throttled background auto-sync per client for NinjaOne
-- devices and M365 licenses/Secure Score, mirroring how
-- autotask_settings.projects_last_synced_at throttles the org-wide
-- Autotask auto-sync — but scoped per client since these two are synced
-- one client at a time, not in one org-wide pass.
alter table public.clients add column if not exists ninjaone_last_synced_at timestamptz;
alter table public.clients add column if not exists m365_last_synced_at timestamptz;
