-- ============================================================================
-- Global (not per-client) mapping from an Autotask contracted service name
-- to the Microsoft 365 licence SKU it's equivalent to — a contract can call
-- a service something like "M365 Premium License" while the actual M365
-- SKU code is "SPB", so reconciliation needs staff to say "this service
-- means that SKU" once, and have it apply to every client with that same
-- service name from then on.
--
-- Run this in the Supabase SQL Editor AFTER 078.
-- ============================================================================

create table public.service_license_mappings (
  id uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  sku_part_number text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.service_license_mappings enable row level security;
create policy "service_license_mappings full access for staff" on public.service_license_mappings
  for all using (public.is_staff()) with check (public.is_staff());
