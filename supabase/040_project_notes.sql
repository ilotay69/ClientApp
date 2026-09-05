-- CG Technologies Client Tracker — Projects gain the same appendable notes
-- thread Tasks and Internal Sales already have (author + timestamp,
-- listed newest first), distinct from the project's Autotask quote log
-- and its tasks.
create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index project_notes_project_idx on public.project_notes (project_id, created_at);
alter table public.project_notes enable row level security;
create policy "project_notes full access for authenticated" on public.project_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
