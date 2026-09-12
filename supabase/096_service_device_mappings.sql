-- ============================================================================
-- Global (not per-client) mapping from an Autotask contracted service name
-- to a NinjaOne device class bucket — same idea as service_license_mappings
-- (079), for the second reconciliation source: "we bill for N workstations"
-- vs. "NinjaOne actually manages N devices of that class." A separate
-- table rather than folding into service_license_mappings, since a device
-- class is a fixed bucket (workstation/server/mac), not a dynamic
-- per-client synced value like an M365 SKU — the mapping UI for it doesn't
-- need a "pick from real synced values" list at all.
--
-- Run this in the Supabase SQL Editor AFTER 095.
-- ============================================================================

create table public.service_device_mappings (
  id uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  device_class text not null check (device_class in ('workstation', 'server', 'mac')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.service_device_mappings enable row level security;
create policy "service_device_mappings full access for staff" on public.service_device_mappings
  for all using (public.is_staff()) with check (public.is_staff());
