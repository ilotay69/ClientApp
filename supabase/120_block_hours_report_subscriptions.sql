-- Settings -> Integrations -> Notifications -> Block of Hours Usage
-- Report: which clients get this report sent automatically, to which
-- email, with an optional CC. The actual send cadence is whatever a
-- Railway cron trigger is pointed at /api/block-hours-report-send with
-- (see that route) — this table only holds the recipient list, not a
-- schedule.
create table public.block_hours_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  to_email text not null,
  cc_email text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index block_hours_report_subscriptions_client_idx
  on public.block_hours_report_subscriptions (client_id);

alter table public.block_hours_report_subscriptions enable row level security;
-- Deliberately no policy for `authenticated` — same posture as every
-- other integration-settings table; only ever touched via the
-- service-role admin client.
