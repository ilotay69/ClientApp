-- CG Technologies Client Tracker — database schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) against a fresh project.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- Enums
-- ============================================================================
create type public.user_role as enum ('admin', 'sales', 'account_manager');
create type public.quote_status as enum ('draft', 'sent', 'follow_up_needed', 'won', 'lost');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.touchpoint_type as enum ('personal_checkin', 'quarterly_review');
create type public.reminder_kind as enum ('quote', 'touchpoint', 'project');

-- ============================================================================
-- profiles — one row per team member, mirrors auth.users
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null default 'sales',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- clients
-- ============================================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  notes text,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- quotes — track proposals sent to clients and their follow-up status
-- ============================================================================
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  amount numeric(12, 2),
  status public.quote_status not null default 'draft',
  sent_date date,
  follow_up_due_date date,
  last_followed_up_at timestamptz,
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- projects
-- ============================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  status public.project_status not null default 'planning',
  start_date date,
  target_end_date date,
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- touchpoints — personal check-ins and quarterly business reviews (QBRs)
-- ============================================================================
create table public.touchpoints (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type public.touchpoint_type not null default 'personal_checkin',
  due_date date not null,
  completed_at timestamptz,
  notes text,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- reminder_log — dedupe so the cron job doesn't email the same due item twice
-- ============================================================================
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  kind public.reminder_kind not null,
  entity_id uuid not null,
  sent_at timestamptz not null default now(),
  recipient_email text not null,
  unique (kind, entity_id, recipient_email, sent_at)
);
-- one reminder per entity per day is enough; the API route checks same-day sends itself.
create index reminder_log_lookup on public.reminder_log (kind, entity_id, sent_at desc);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on public.clients
  for each row execute procedure public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute procedure public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute procedure public.set_updated_at();
create trigger touchpoints_set_updated_at before update on public.touchpoints
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- Row Level Security
--
-- This is a small trusted internal team: every signed-in team member can read
-- and edit every record (a sales rep may need to update a touchpoint owned by
-- an account manager, etc). Only the `team` management screen is admin-only,
-- enforced below. If you later want stricter per-owner access, tighten the
-- `using`/`with check` clauses on quotes/projects/touchpoints to
-- `owner_id = auth.uid()`.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.projects enable row level security;
alter table public.touchpoints enable row level security;
alter table public.reminder_log enable row level security;

create policy "profiles readable by authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles updatable by self or admin" on public.profiles
  for update using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "clients full access for authenticated" on public.clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "quotes full access for authenticated" on public.quotes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "projects full access for authenticated" on public.projects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "touchpoints full access for authenticated" on public.touchpoints
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- reminder_log is only ever written by the server (service role key), which
-- bypasses RLS entirely, so it just needs to be readable for debugging.
create policy "reminder_log readable by authenticated" on public.reminder_log
  for select using (auth.role() = 'authenticated');
