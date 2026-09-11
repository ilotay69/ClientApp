-- ============================================================================
-- Durable history of interview invites sent via "Schedule Interview" —
-- previously the scheduled date/time only ever existed in the sent email
-- and its .ics attachment, with nothing kept in the app itself. A separate
-- table (not just columns on resumes) so re-scheduling a candidate keeps
-- every prior invite too, and so an "upcoming interviews" list is a plain
-- query rather than something reconstructed from email logs.
--
-- Run this in the Supabase SQL Editor AFTER 087.
-- ============================================================================

create table public.resume_interviews (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_posting_id uuid references public.job_postings (id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  location text,
  notes text,
  scheduled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index resume_interviews_resume_id_idx on public.resume_interviews (resume_id);
create index resume_interviews_scheduled_at_idx on public.resume_interviews (scheduled_at);

alter table public.resume_interviews enable row level security;
create policy "resume_interviews full access for staff" on public.resume_interviews
  for all using (public.is_staff()) with check (public.is_staff());
