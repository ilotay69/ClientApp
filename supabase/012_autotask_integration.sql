-- Autotask integration, Phase 1: client-scoped tickets via a Company↔client
-- mapping. Renames the AI-settings permission to a broader "integrations"
-- permission (RENAME VALUE is transaction-safe, unlike ADD VALUE).

alter type public.permission_key rename value 'manage_ai_settings' to 'manage_integrations';

-- Singleton table (the "id bool primary key check(id)" trick guarantees at
-- most one row) — one org-wide set of credentials, unlike the per-provider
-- ai_provider_settings table.
create table public.autotask_settings (
  id boolean primary key default true,
  constraint autotask_settings_singleton check (id),
  username text,
  secret text,
  integration_code text,
  zone_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger autotask_settings_set_updated_at before update on public.autotask_settings
  for each row execute procedure public.set_updated_at();

alter table public.autotask_settings enable row level security;
-- Deliberately no policy for `authenticated` — same posture as
-- ai_provider_settings. Credentials are only ever touched via the
-- service-role admin client.

alter table public.clients add column if not exists autotask_company_id integer;

create table public.autotask_tickets (
  id integer primary key, -- Autotask's own ticket id, already unique
  client_id uuid not null references public.clients (id) on delete cascade,
  ticket_number text,
  title text not null,
  status text,
  priority text,
  queue_name text,
  assigned_resource_name text,
  due_date timestamptz,
  last_synced_at timestamptz not null default now()
);

create index autotask_tickets_client_idx on public.autotask_tickets (client_id);

alter table public.autotask_tickets enable row level security;
create policy "autotask_tickets full access for authenticated" on public.autotask_tickets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
