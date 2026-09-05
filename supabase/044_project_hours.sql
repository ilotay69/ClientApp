-- Manually-quoted hours per project, plus actual hours worked pulled from
-- the linked Autotask ticket's time entries (summed and refreshed on each
-- Autotask project sync — see syncProjectSlaProjects). quoted_hours is
-- never touched by that sync; only actual_hours/hours_synced_at are.
alter table public.projects add column if not exists quoted_hours numeric;
alter table public.projects add column if not exists actual_hours numeric;
alter table public.projects add column if not exists hours_synced_at timestamptz;
