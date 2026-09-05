-- CG Technologies Client Tracker — lets a client_interactions row be
-- scoped to one project instead of the client generally. Used first for
-- Autotask quote references logged from a project's own row: those
-- should show up under that project, not the client's Timeline tab.
alter table public.client_interactions
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists client_interactions_project_idx
  on public.client_interactions (project_id, created_at desc);
