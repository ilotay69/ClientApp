create table public.huntress_settings (
  id boolean primary key default true,
  constraint huntress_settings_singleton check (id),
  api_key text,
  api_secret text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger huntress_settings_set_updated_at before update on public.huntress_settings
  for each row execute procedure public.set_updated_at();

alter table public.huntress_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- autotask_settings/ninjaone_settings/hudu_settings. Huntress authenticates
-- via HTTP Basic Auth (base64 of api_key:api_secret) with a static header
-- on every request — no OAuth token to cache, unlike Autotask/NinjaOne/M365.
