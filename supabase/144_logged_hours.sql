-- ============================================================================
-- Logged Hours — a plain self-reported timesheet, separate from Autotask's
-- own time entries (Team Hours widget, Reports → Resource hours). Staff pick
-- a date and log how many hours they worked that day; the app buckets each
-- entry into whichever semi-monthly half of the month it falls in (1st-15th
-- or 16th-end) for display, purely a UI grouping - no half-period column
-- needed here.
--
-- One row per person per day (upsert on re-entering the same date) rather
-- than an append-only log, since "how many hours did I log on the 4th" is a
-- single number someone corrects in place, not a running history.
-- ============================================================================

create table public.logged_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index logged_hours_user_date_idx on public.logged_hours (user_id, work_date);

create trigger logged_hours_set_updated_at before update on public.logged_hours
  for each row execute procedure public.set_updated_at();

-- Same posture as every other staff-only table (see 129) - the app itself
-- enforces "only owners see everyone else's" (there's no permission for it,
-- just profiles.role = 'owner', same check getMyPermissions already makes
-- free per request); RLS here only draws the outer staff/not-staff line.
alter table public.logged_hours enable row level security;
create policy "logged_hours full access for staff" on public.logged_hours
  for all using (public.is_staff()) with check (public.is_staff());
