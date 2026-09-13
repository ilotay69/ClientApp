-- ============================================================================
-- In-app alerts — a persistent to-do shown on the Overview page until
-- acknowledged, replacing an immediate email for internal (staff-to-staff)
-- notifications. First two sources: task assignment and the quarterly
-- review workflow (submitted/approved/adjustment-requested) — see
-- src/lib/alerts.ts. The daily reminder cron (/api/reminders) also folds
-- in whatever's still unacknowledged, since that digest is meant to stay
-- the one email that matters.
--
-- Run this in the Supabase SQL Editor AFTER 107.
-- ============================================================================

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- Not a DB enum — new alert sources shouldn't need a migration just to
  -- add another kind (see AlertKind in src/lib/alerts.ts).
  kind text not null,
  title text not null,
  detail text,
  href text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index alerts_recipient_idx on public.alerts (recipient_id, acknowledged_at, created_at desc);

alter table public.alerts enable row level security;
create policy "alerts full access for staff" on public.alerts
  for all using (public.is_staff()) with check (public.is_staff());
