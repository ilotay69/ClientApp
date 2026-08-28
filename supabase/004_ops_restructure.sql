-- CG Technologies Client Tracker — ops restructure
-- Run this in the Supabase SQL Editor AFTER schema.sql, 002_email_integration.sql,
-- and 003_ai_suggestions.sql.
--
-- This migration turns the app from a sales/account-manager CRM into an MSP
-- operations tool for a director + managers + techs: roles are renamed,
-- the formal Quotes workflow is dropped in favor of email-driven follow-up
-- suggestions (no dollar amounts), touchpoints gain a monthly-visit type
-- and a trackable "next action," a shared recurring-service-check catalog
-- is added, and a general `tasks` table becomes the one place work gets
-- assigned to a specific person.
--
-- Run top to bottom as separate statements (don't wrap in one BEGIN/COMMIT —
-- a couple of the enum changes need to be visible to later statements in
-- the same script, which the Supabase SQL editor handles fine run this way).

-- ============================================================================
-- 1. Roles — admin/sales/account_manager never matched this org. Director
--    sees and assigns everything, manager runs their team, tech works their
--    assigned queue. New signups default to tech; promote via /team.
-- ============================================================================
alter type public.user_role rename value 'admin' to 'director';
alter type public.user_role rename value 'sales' to 'manager';
alter type public.user_role rename value 'account_manager' to 'tech';
alter table public.profiles alter column role set default 'tech';

-- ============================================================================
-- 2. Drop the formal Quotes workflow. Sales tracks quotes elsewhere; this
--    app only needs to flag, from email, when a customer's asked for
--    pricing and we haven't answered, or we sent something and they've
--    gone quiet — that's handled by the suggestion engine below, with no
--    dollar amounts involved.
-- ============================================================================
drop table if exists public.quotes cascade;
drop type if exists public.quote_status;

-- ============================================================================
-- 3. Touchpoints — rename the existing check-in type to "monthly visit" to
--    match how the team actually works, and add a next-action field so a
--    visit or QBR can leave behind something trackable, not just notes.
-- ============================================================================
alter type public.touchpoint_type rename value 'personal_checkin' to 'monthly_visit';
alter table public.touchpoints add column if not exists next_action text;

-- ============================================================================
-- 4. Recurring service checks — one shared catalog of the things you
--    maintain (backups, firewall firmware, license reviews, …), each
--    client opted into a subset with its own cadence and last-checked date.
-- ============================================================================
create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_cadence_days integer not null default 90,
  created_at timestamptz not null default now()
);

create table if not exists public.client_service_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  service_id uuid not null references public.service_catalog (id) on delete cascade,
  -- null cadence_days = use the catalog's default_cadence_days
  cadence_days integer,
  last_checked_at date,
  last_checked_by uuid references public.profiles (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, service_id)
);

create index if not exists client_service_checks_client_idx
  on public.client_service_checks (client_id);

alter table public.service_catalog enable row level security;
alter table public.client_service_checks enable row level security;

create policy "service_catalog full access for authenticated" on public.service_catalog
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "client_service_checks full access for authenticated" on public.client_service_checks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create trigger client_service_checks_set_updated_at before update on public.client_service_checks
  for each row execute procedure public.set_updated_at();

-- A starter catalog — edit or add to this from the Service catalog settings page.
insert into public.service_catalog (name, description, default_cadence_days)
values
  ('Backup verification', 'Confirm backups are running and a restore test has been done.', 30),
  ('Firewall firmware', 'Check for and apply firmware/security updates.', 90),
  ('M365 license review', 'Confirm licensed seats match active users.', 90),
  ('Antivirus/EDR health check', 'Confirm agents are installed, updated, and reporting in.', 30),
  ('Patch compliance review', 'Confirm servers and workstations are current on patches.', 30)
on conflict (name) do nothing;

-- ============================================================================
-- 5. Tasks — the one place work gets assigned to a specific person, whether
--    it came from a flagged email, an overdue service check, or a touchpoint
--    action item. `source_suggestion_id` is intentionally not a foreign key
--    (created before `tasks` exists is fine either order, but this avoids a
--    circular dependency with `suggestions.task_id` below).
-- ============================================================================
create type public.task_kind as enum (
  'email_follow_up',
  'quote_follow_up',
  'urgent_alert',
  'new_project',
  'service_check',
  'touchpoint_action',
  'general'
);
create type public.task_status as enum ('open', 'in_progress', 'done', 'dismissed');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  kind public.task_kind not null default 'general',
  title text not null,
  detail text,
  status public.task_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  source_suggestion_id uuid,
  source_touchpoint_id uuid references public.touchpoints (id) on delete set null,
  source_service_check_id uuid references public.client_service_checks (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_assigned_idx on public.tasks (assigned_to, status);
create index if not exists tasks_client_idx on public.tasks (client_id);

alter table public.tasks enable row level security;
create policy "tasks full access for authenticated" on public.tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- 6. Suggestions — widen what the AI insight job can flag: mailbox urgency,
--    new-project signals, and quote-style follow-ups in both directions
--    (customer asked and we haven't quoted, or we quoted and they went
--    quiet) — all without tracking a dollar amount anywhere. `qbr_prep`
--    covers monthly visits too now, so it's renamed to `review_prep`.
--    `task_id` links a suggestion to the task it was promoted into.
-- ============================================================================
alter type public.suggestion_kind rename value 'qbr_prep' to 'review_prep';
alter type public.suggestion_kind add value if not exists 'urgent_alert';
alter type public.suggestion_kind add value if not exists 'new_project';
alter type public.suggestion_kind add value if not exists 'quote_follow_up';

create type public.suggestion_priority as enum ('normal', 'high');
alter table public.suggestions add column if not exists priority public.suggestion_priority not null default 'normal';
alter table public.suggestions add column if not exists task_id uuid references public.tasks (id) on delete set null;

-- ============================================================================
-- 7. reminder_log — rebuilt against the new set of things worth a daily
--    email reminder. It's just a dedupe log, safe to rebuild empty.
-- ============================================================================
drop table if exists public.reminder_log cascade;
drop type if exists public.reminder_kind;

create type public.reminder_kind as enum ('touchpoint', 'project', 'task', 'service_check');

create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  kind public.reminder_kind not null,
  entity_id uuid not null,
  sent_at timestamptz not null default now(),
  recipient_email text not null,
  unique (kind, entity_id, recipient_email, sent_at)
);
create index reminder_log_lookup on public.reminder_log (kind, entity_id, sent_at desc);

alter table public.reminder_log enable row level security;
create policy "reminder_log readable by authenticated" on public.reminder_log
  for select using (auth.role() = 'authenticated');
