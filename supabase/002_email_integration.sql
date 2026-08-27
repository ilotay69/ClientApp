-- CG Technologies Client Tracker — Microsoft 365 email integration
-- Run this in the Supabase SQL Editor AFTER schema.sql. Adds Microsoft 365
-- mailbox connections and the client-linked emails they produce.

-- ============================================================================
-- Better name fallback for OAuth sign-ins (Azure sends `name`, not
-- `full_name`, in user metadata) — replaces the trigger from schema.sql.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    new.email
  );
  return new;
end;
$$;

-- ============================================================================
-- mail_connections — one row per team member who has connected a Microsoft
-- 365 mailbox. Holds the OAuth tokens needed to call Microsoft Graph on
-- their behalf in the background (a separate, narrower-scoped OAuth flow
-- from login — see /api/mail/connect).
-- ============================================================================
create table public.mail_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mailbox_email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table public.mail_connections enable row level security;

-- A user can see/manage only their own connection. All writes from the sync
-- job itself go through the service role key, which bypasses RLS.
create policy "mail_connections owned by self" on public.mail_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- email_links — emails pulled from a connected mailbox whose subject starts
-- with "quote" or "project" and whose sender/recipient matched a client's
-- contact email or domain.
-- ============================================================================
create type public.email_link_type as enum ('quote', 'project');

create table public.email_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type public.email_link_type not null,
  subject text not null,
  from_name text,
  from_email text not null,
  received_at timestamptz not null,
  web_link text,
  graph_message_id text not null unique,
  connection_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index email_links_client_idx on public.email_links (client_id, received_at desc);

alter table public.email_links enable row level security;

-- Same "small trusted team" model as the rest of the app: anyone signed in
-- can see linked emails. Only the sync job (service role) inserts them.
create policy "email_links readable by authenticated" on public.email_links
  for select using (auth.role() = 'authenticated');
