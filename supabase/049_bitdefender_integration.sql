create table public.bitdefender_settings (
  id boolean primary key default true,
  constraint bitdefender_settings_singleton check (id),
  region text not null default 'cloud.gravityzone.bitdefender.com',
  api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger bitdefender_settings_set_updated_at before update on public.bitdefender_settings
  for each row execute procedure public.set_updated_at();

alter table public.bitdefender_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as every
-- other integration's settings table. Bitdefender GravityZone Cloud's API
-- is JSON-RPC 2.0 over HTTPS POST (not REST), authenticated via static
-- HTTP Basic Auth (base64 of api_key: with an empty password) — same
-- static-header shape as Huntress, no OAuth token to cache. `region`
-- holds one of two fixed cloud hostnames (non-EU: cloud.gravityzone.
-- bitdefender.com, EU: cloudgz.gravityzone.bitdefender.com), same idea as
-- NinjaOne's region field.
