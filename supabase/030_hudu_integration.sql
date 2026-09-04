-- CG Technologies Client Tracker — Hudu API connection. Phase 1: just the
-- credential storage + test connection, matching the Autotask/NinjaOne
-- pattern. Pulling client credentials (e.g. M365 app registrations) out of
-- Hudu is a deliberate follow-up, not built here — it needs to know how
-- this org's Hudu instance actually structures that data (asset layout,
-- field names) before it can be built correctly.
create table public.hudu_settings (
  id boolean primary key default true,
  constraint hudu_settings_singleton check (id),
  base_url text,
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger hudu_settings_set_updated_at before update on public.hudu_settings
  for each row execute procedure public.set_updated_at();
alter table public.hudu_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- autotask_settings/ninjaone_settings. The API key must never be
-- selectable from a signed-in user's own browser session.
