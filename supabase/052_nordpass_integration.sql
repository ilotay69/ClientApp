create table public.nordpass_settings (
  id boolean primary key default true,
  constraint nordpass_settings_singleton check (id),
  private_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger nordpass_settings_set_updated_at before update on public.nordpass_settings
  for each row execute procedure public.set_updated_at();

alter table public.nordpass_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- every other integration's settings table.
--
-- NordPass's own public docs (support.nordpass.com) only cover generating
-- this private key in the MSP Admin Panel UI (Integrations -> Provider
-- API -> Generate Private Key) for their "Provider API for Usage
-- Reporting" — the actual technical request format (JWT construction/
-- claims/algorithm, base URL, endpoint paths) isn't published anywhere
-- public, unlike every other integration in this app, where a real spec
-- (official PDF, readme.io reference, or on-premise API guide) was found
-- and verified. This table is just a safe place to store the key now so
-- it isn't lost; the real API client is a deliberate follow-up once that
-- spec is confirmed — from NordPass support directly, or from whatever
-- is shown inline in the admin panel when the key is actually generated.
