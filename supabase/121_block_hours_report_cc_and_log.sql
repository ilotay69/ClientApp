-- Three changes to Block of Hours Usage Report automation:
--
-- 1. CC moves from a per-client column to one shared setting — every
--    email this automation sends gets the same CC, not a different one
--    typed in per client.
-- 2. A send log — one row per actual send attempt (success or failure),
--    so there's a real audit trail of what went out and when.
alter table public.block_hours_report_subscriptions drop column if exists cc_email;

create table public.block_hours_report_settings (
  id boolean primary key default true,
  constraint block_hours_report_settings_singleton check (id),
  cc_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger block_hours_report_settings_set_updated_at before update on public.block_hours_report_settings
  for each row execute procedure public.set_updated_at();

alter table public.block_hours_report_settings enable row level security;
-- Deliberately no policy for `authenticated` — same posture as every
-- other integration-settings table; only ever touched via the
-- service-role admin client.

create table public.block_hours_report_log (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + set null on delete: a client can be removed later without
  -- losing the historical record that a report was once sent for them.
  client_id uuid references public.clients (id) on delete set null,
  client_name text not null,
  to_email text not null,
  cc_email text,
  sent_at timestamptz not null default now(),
  -- Null means it actually sent; set means this attempt failed (and no
  -- email went out) — kept in the same log so "why didn't X get theirs"
  -- doesn't require checking two different places.
  error text
);

create index block_hours_report_log_sent_at_idx on public.block_hours_report_log (sent_at desc);

alter table public.block_hours_report_log enable row level security;
-- Deliberately no policy for `authenticated` — service-role admin client
-- only, same posture as the rest of this feature.
