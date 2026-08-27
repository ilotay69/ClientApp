-- CG Technologies Client Tracker — AI insights on top of the mailbox sync
-- Run this in the Supabase SQL Editor AFTER schema.sql and
-- 002_email_integration.sql.

-- ============================================================================
-- Widen email_links: it used to only store emails whose subject started
-- with "quote" or "project". Now every email matched to a known client gets
-- stored (tagged 'general' if it doesn't fit the other two), so the AI
-- suggestion job has real context to work with. A short body preview is
-- stored alongside — not the full email body — to keep what we retain
-- close to what Outlook's own preview pane already shows.
-- ============================================================================
alter type public.email_link_type add value if not exists 'general';
alter table public.email_links add column if not exists body_preview text;

-- ============================================================================
-- suggestions — AI-generated, human-reviewed insights. Nothing in this app
-- writes to clients/quotes/projects/touchpoints on the AI's behalf; a
-- suggestion is just a card someone reviews and acts on manually.
-- ============================================================================
create type public.suggestion_kind as enum (
  'follow_up',
  'opportunity',
  'stale_contact',
  'qbr_prep',
  'other'
);
create type public.suggestion_status as enum ('open', 'dismissed', 'done');

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.suggestion_kind not null,
  summary text not null,
  detail text,
  related_email_ids uuid[],
  status public.suggestion_status not null default 'open',
  created_at timestamptz not null default now()
);

create index suggestions_status_idx on public.suggestions (status, created_at desc);
create index suggestions_client_idx on public.suggestions (client_id);

alter table public.suggestions enable row level security;

-- Same "small trusted team" model as the rest of the app. Only the
-- suggestion-generation job (service role) inserts or deletes rows; any
-- signed-in team member can read them and mark one dismissed/done.
create policy "suggestions readable by authenticated" on public.suggestions
  for select using (auth.role() = 'authenticated');
create policy "suggestions updatable by authenticated" on public.suggestions
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
