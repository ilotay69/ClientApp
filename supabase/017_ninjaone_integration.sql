create table public.ninjaone_settings (
  id boolean primary key default true,
  constraint ninjaone_settings_singleton check (id),
  region text not null default 'app.ninjarmm.com',
  client_id text,
  client_secret text,
  cached_access_token text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger ninjaone_settings_set_updated_at before update on public.ninjaone_settings
  for each row execute procedure public.set_updated_at();

alter table public.ninjaone_settings enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- autotask_settings/ai_provider_settings.

alter table public.clients add column if not exists ninjaone_organization_id integer;

create table public.ninjaone_devices (
  id integer primary key, -- NinjaOne's own device id
  client_id uuid not null references public.clients (id) on delete cascade,
  system_name text not null,
  node_class text,
  is_offline boolean,
  last_contact timestamptz,
  raw jsonb, -- full device payload — preserves unconfirmed fields (e.g. antivirus/patch status)
  last_synced_at timestamptz not null default now()
);

create index ninjaone_devices_client_idx on public.ninjaone_devices (client_id);

alter table public.ninjaone_devices enable row level security;
create policy "ninjaone_devices full access for authenticated" on public.ninjaone_devices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
