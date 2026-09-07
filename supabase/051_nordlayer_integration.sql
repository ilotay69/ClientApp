create table public.nordlayer_settings (
  id boolean primary key default true,
  constraint nordlayer_settings_singleton check (id),
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger nordlayer_settings_set_updated_at before update on public.nordlayer_settings
  for each row execute procedure public.set_updated_at();

alter table public.nordlayer_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as every
-- other integration's settings table. NordLayer's MSP API is plain REST at
-- one fixed base URL (https://partner-api.nordlayer.com/msp/v1),
-- authenticated via a static "Authorization: ApiKey <key>" header — no
-- Basic Auth encoding, no OAuth token, same simple shape as Wizer.
