-- ============================================================================
-- Daily backup checklist — replaces the manually-emailed spreadsheet with an
-- in-app form, kept as history rather than one-off emails, so an AI pass can
-- read the last 2 weeks of it and staff can look back at any past day.
--
-- One row per calendar day (backup_reports), one row per checklist section
-- within that day (backup_report_items) — a normalized items table rather
-- than one wide row with a column per section, since the section list
-- itself may change over time (see src/lib/backup-report-sections.ts) and
-- a new/removed section shouldn't need a schema migration.
--
-- Run this in the Supabase SQL Editor AFTER 099.
-- ============================================================================

-- Singleton — where the completed daily report gets emailed. No secrets
-- here (just an address), unlike shared_mailbox_settings/ninjaone_settings/
-- etc., so a plain staff RLS policy is fine rather than service-role only.
create table public.backup_report_settings (
  id boolean primary key default true,
  constraint backup_report_settings_singleton check (id),
  recipient_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.backup_report_settings (id) values (true);

create trigger backup_report_settings_set_updated_at
  before update on public.backup_report_settings
  for each row execute function public.set_updated_at();

alter table public.backup_report_settings enable row level security;
create policy "backup_report_settings full access for staff" on public.backup_report_settings
  for all using (public.is_staff()) with check (public.is_staff());

create table public.backup_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- Rolling AI read on the last 2 weeks of reports (this one included),
  -- regenerated each time a report is completed — overwritten on THIS row
  -- only, not a history of its own (the reports themselves are the history
  -- it's read from).
  ai_analysis text,
  ai_analysis_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index backup_reports_report_date_idx on public.backup_reports (report_date desc);

alter table public.backup_reports enable row level security;
create policy "backup_reports full access for staff" on public.backup_reports
  for all using (public.is_staff()) with check (public.is_staff());

create table public.backup_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.backup_reports (id) on delete cascade,
  -- Matches a key in BACKUP_REPORT_SECTIONS (src/lib/backup-report-sections.ts)
  -- — not a DB enum, so the section list can change without a migration.
  section_key text not null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'issue', 'na')),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (report_id, section_key)
);

create index backup_report_items_report_idx on public.backup_report_items (report_id);

alter table public.backup_report_items enable row level security;
create policy "backup_report_items full access for staff" on public.backup_report_items
  for all using (public.is_staff()) with check (public.is_staff());
