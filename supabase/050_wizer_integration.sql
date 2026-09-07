create table public.wizer_settings (
  id boolean primary key default true,
  constraint wizer_settings_singleton check (id),
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger wizer_settings_set_updated_at before update on public.wizer_settings
  for each row execute procedure public.set_updated_at();

alter table public.wizer_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as every
-- other integration's settings table. Wizer's API is plain REST at one
-- fixed base URL (https://gateway.wizer-training.com/api/v1/external),
-- authenticated via a single static custom header (apiKey: <key>) — no
-- Basic Auth encoding, no OAuth token, no region choice, the simplest of
-- every integration in this app so far.
