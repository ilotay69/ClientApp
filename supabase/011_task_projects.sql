-- CG Technologies Client Tracker — link tasks to a project
-- Run this in the Supabase SQL Editor AFTER 010_client_contacts_timeline.sql.
--
-- Lets a task optionally belong to a project, so the project's own page can
-- show its own task list, separate from the general Tasks tab (which still
-- shows every task, project-linked or not).

alter table public.tasks add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists tasks_project_idx on public.tasks (project_id);
