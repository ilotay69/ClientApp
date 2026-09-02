-- Enrichment fields from NinjaOne's org-wide bulk "queries" reports
-- (computer-systems, operating-systems, logged-on-users) — best-effort
-- field extraction, so these can be null even once synced.
alter table public.ninjaone_devices add column if not exists os_name text;
alter table public.ninjaone_devices add column if not exists os_version text;
alter table public.ninjaone_devices add column if not exists manufacturer text;
alter table public.ninjaone_devices add column if not exists model text;
alter table public.ninjaone_devices add column if not exists last_logged_on_user text;
alter table public.ninjaone_devices add column if not exists detail jsonb;
