-- ============================================================================
-- Marks one client+source+service mismatch as a known, intentional
-- exception ("we know these numbers differ and that's fine, don't keep
-- flagging it") — distinct from actually fixing the underlying contract or
-- licence count, which just makes the live comparison show "matched" on
-- its own next sync, with nothing to record here at all. A waiver is the
-- one piece of reconciliation state that genuinely needs to persist
-- independent of the live synced numbers.
--
-- unique (client_id, source, service_name): at most one current waiver per
-- service per client per source — saving a new one replaces the old note/
-- author/timestamp rather than accumulating a history, since only the
-- CURRENT waiver reason matters for suppressing the dashboard count.
--
-- Run this in the Supabase SQL Editor AFTER 096.
-- ============================================================================

create table public.reconciliation_waivers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source text not null check (source in ('m365', 'ninjaone')),
  service_name text not null,
  note text not null,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz not null default now(),
  unique (client_id, source, service_name)
);

create index reconciliation_waivers_client_idx on public.reconciliation_waivers (client_id);

alter table public.reconciliation_waivers enable row level security;
create policy "reconciliation_waivers full access for staff" on public.reconciliation_waivers
  for all using (public.is_staff()) with check (public.is_staff());
