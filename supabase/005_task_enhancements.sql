-- CG Technologies Client Tracker — task enhancements
-- Run this in the Supabase SQL Editor AFTER 004_ops_restructure.sql.
--
-- Adds priority and a start date to tasks, lets a task carry no client
-- (internal work / improvements get their own kind), and lets a task be
-- assigned to more than one tech via a junction table. `tasks.assigned_to`
-- stays in place as the "primary" assignee — kept in sync with the first
-- selected assignee — so the dashboard, client detail page, reminders job,
-- and suggestion-promote flow (none of which needed to change for this)
-- keep working unmodified.
--
-- Run top to bottom as separate statements, same as 004.

alter type public.task_kind add value if not exists 'internal';
alter type public.task_kind add value if not exists 'improvement';

create type public.task_priority as enum ('low', 'medium', 'high');
alter table public.tasks add column if not exists priority public.task_priority not null default 'medium';
alter table public.tasks add column if not exists start_date date;

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index if not exists task_assignees_profile_idx on public.task_assignees (profile_id);

alter table public.task_assignees enable row level security;
create policy "task_assignees full access for authenticated" on public.task_assignees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed the junction table from the existing single assignee so nothing
-- assigned before this migration shows up as unassigned on the Tasks tab.
insert into public.task_assignees (task_id, profile_id)
select id, assigned_to from public.tasks where assigned_to is not null
on conflict do nothing;
