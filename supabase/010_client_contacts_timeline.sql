-- CG Technologies Client Tracker — client contacts + activity timeline
-- Run this in the Supabase SQL Editor AFTER 009_ai_settings.sql.
--
-- Adds a proper list of named contacts per client (name + email), and a
-- structured activity timeline (Note/Call/Meeting, optionally tied to one
-- of those contacts) replacing the single free-text `clients.notes` field
-- on the client form. The "Email" entries in that timeline come from the
-- existing `email_links` table at query time — no new email storage here.

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create index client_contacts_client_idx on public.client_contacts (client_id);

alter table public.client_contacts enable row level security;
create policy "client_contacts full access for authenticated" on public.client_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create type public.client_interaction_type as enum ('note', 'call', 'meeting');

create table public.client_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.client_contacts (id) on delete set null,
  type public.client_interaction_type not null default 'note',
  subject text,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index client_interactions_client_idx on public.client_interactions (client_id, created_at desc);

alter table public.client_interactions enable row level security;
create policy "client_interactions full access for authenticated" on public.client_interactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Carry forward any existing free-text client note as the first timeline
-- entry, so nothing already written is lost when Notes leaves the client
-- form. clients.notes itself is left in place (unused going forward, not
-- dropped) as cheap insurance against this needing a redo.
insert into public.client_interactions (client_id, type, body, created_at)
select id, 'note', notes, updated_at from public.clients
where notes is not null and trim(notes) <> '';
