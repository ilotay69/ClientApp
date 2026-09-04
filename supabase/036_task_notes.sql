-- CG Technologies Client Tracker — Tasks gain the same back-and-forth notes
-- thread Sales Requests already has, replacing the single free-text
-- "notes" field in the UI (that column stays in place for any existing
-- history; it's just no longer edited there).
create table public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index task_notes_task_idx on public.task_notes (task_id, created_at);
alter table public.task_notes enable row level security;
create policy "task_notes full access for authenticated" on public.task_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
