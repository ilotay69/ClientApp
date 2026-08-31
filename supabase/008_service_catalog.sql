-- CG Technologies Client Tracker — service catalog (offerings)
-- Run this in the Supabase SQL Editor AFTER 007_role_permissions.sql, THEN
-- run 008b_service_catalog_seed.sql as a separate query afterwards —
-- Postgres won't let a newly ADD VALUE'd enum value be used (the seed
-- insert below needs 'manage_services') in the same transaction that added
-- it, so this has to be two steps.
--
-- Distinct from the existing `service_catalog`/`client_service_checks`
-- tables (now labeled "Recurring Services" in the UI — cadence-based
-- maintenance checks like backup verification). This is a simple catalog
-- of the services the company offers, and which clients currently receive
-- which of them — no cadence, no last-checked date, no assignee.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.client_services (
  client_id uuid not null references public.clients (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, service_id)
);

create index client_services_client_idx on public.client_services (client_id);

alter table public.services enable row level security;
alter table public.client_services enable row level security;

create policy "services full access for authenticated" on public.services
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "client_services full access for authenticated" on public.client_services
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- New permission, gating both catalog management (add/remove offerings)
-- and attaching/detaching a service on a client — same shape as the
-- existing manage_service_catalog permission for Recurring Services.
-- Seeding role_permissions with it happens in 008b, run separately (see
-- note at the top of this file).
alter type public.permission_key add value if not exists 'manage_services';
