-- CG Technologies Client Tracker — persisted Autotask time entries.
--
-- Everything else this app pulls from Autotask (tickets, contract
-- services, projects) is replace-on-sync: a read-only cache of Autotask's
-- current state, wiped and rebuilt every sync since there's no need to
-- remember what a ticket USED to look like. Time entries are different —
-- the whole point here is accumulating history (what got worked on, by
-- whom, for which client, day after day) so patterns can be analyzed
-- later, so this table only ever grows, upserted by Autotask's own time
-- entry id rather than replaced.
--
-- Run this in the Supabase SQL Editor AFTER 024_autotask_project_sync.sql.

create table public.autotask_time_entries (
  id integer primary key, -- Autotask's own TimeEntries id
  client_id uuid references public.clients (id) on delete set null,
  resource_id integer not null,
  resource_name text not null,
  ticket_id integer,
  task_id integer,
  hours_worked numeric not null,
  date_worked date not null,
  summary_notes text,
  synced_at timestamptz not null default now()
);

create index autotask_time_entries_client_date_idx
  on public.autotask_time_entries (client_id, date_worked);
create index autotask_time_entries_resource_date_idx
  on public.autotask_time_entries (resource_id, date_worked);
create index autotask_time_entries_date_idx
  on public.autotask_time_entries (date_worked);

alter table public.autotask_time_entries enable row level security;
create policy "autotask_time_entries full access for authenticated" on public.autotask_time_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
