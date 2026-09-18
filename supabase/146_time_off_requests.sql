-- ============================================================================
-- Time off requests (Vacation/Sick) - staff request time off; an owner
-- approves or declines, and either side can leave notes on the request to
-- discuss it before a decision. Notifications are in-app alerts only (see
-- src/lib/alerts.ts, same "task_assigned" convention) - no dedicated email
-- for this feature.
-- ============================================================================

create type public.time_off_type as enum ('vacation', 'sick');
create type public.time_off_status as enum ('pending', 'approved', 'declined');

create table public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.time_off_type not null default 'vacation',
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text,
  status public.time_off_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_off_requests_user_idx on public.time_off_requests (user_id, start_date desc);
create index time_off_requests_status_idx on public.time_off_requests (status, start_date);

create trigger time_off_requests_set_updated_at before update on public.time_off_requests
  for each row execute procedure public.set_updated_at();

-- The back-and-forth ("discuss") before a decision, and a record of it
-- afterward - kept even once approved/declined, not just while pending.
create table public.time_off_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.time_off_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index time_off_request_notes_request_idx on public.time_off_request_notes (request_id, created_at);

-- Same posture as every other staff-only table (129, 144) - the app itself
-- enforces "only owners see/decide everyone else's, everyone sees their
-- own" (profiles.role = 'owner', not a permission); RLS here only draws
-- the outer staff/not-staff line.
alter table public.time_off_requests enable row level security;
create policy "time_off_requests full access for staff" on public.time_off_requests
  for all using (public.is_staff()) with check (public.is_staff());

alter table public.time_off_request_notes enable row level security;
create policy "time_off_request_notes full access for staff" on public.time_off_request_notes
  for all using (public.is_staff()) with check (public.is_staff());
