-- CG Technologies Client Tracker — derive Projects from Autotask tickets
-- tagged with the "Project SLA" service level agreement, instead of
-- creating a project by hand in both Autotask and this app.
--
-- Run this in the Supabase SQL Editor AFTER 023_task_privacy.sql.

alter table public.projects
  add column if not exists source_autotask_ticket_id integer unique;
