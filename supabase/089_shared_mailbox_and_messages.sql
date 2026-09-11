-- ============================================================================
-- Shared ops@cgtechnologies.com mailbox integration — app-only (client
-- credentials) Graph auth, not the per-user delegated OAuth the personal
-- mailbox connections use. Delegated refresh is what made /api/mail-sync's
-- cron unreliable (AADSTS53003 — see that route's own comment); app-only
-- tokens are freely re-mintable from the existing app registration's client
-- secret with no per-user Conditional Access check at all, the same
-- approach m365_client_credentials already uses successfully for M365
-- partner sync. So there's no access_token/refresh_token to store here —
-- just a cached app-only token (re-minted when it's close to expiry) and
-- sync status.
--
-- Run this in the Supabase SQL Editor AFTER 088.
-- ============================================================================

-- The mailbox address itself (RECRUITMENT_MAILBOX_EMAIL) is an env var, not
-- a column here — deliberately, so there's exactly one source of truth for
-- which mailbox every Graph call actually targets, not a DB value that
-- could drift out of sync with it.
create table public.shared_mailbox_settings (
  id boolean primary key default true,
  constraint shared_mailbox_settings_singleton check (id),
  cached_access_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  last_sync_error_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.shared_mailbox_settings (id) values (true);

create trigger shared_mailbox_settings_updated_at
  before update on public.shared_mailbox_settings
  for each row execute function public.set_updated_at();

-- Service-role/admin-client only — no RLS policy for `authenticated`, same
-- as autotask_settings/huntress_settings.
alter table public.shared_mailbox_settings enable row level security;

-- ============================================================================
-- Full message history (both directions) between staff and a candidate,
-- sent/received through the shared mailbox — the durable record a "Messages"
-- thread under each candidate is built from.
-- ============================================================================

create table public.resume_messages (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- Plain dedup, not resumes' attachment-aware composite key — a reply
  -- isn't also being deduped against attachments. Only ever set for
  -- inbound rows (an outbound send has no Graph message id of its own to
  -- dedupe against); unique still holds since two different real inbound
  -- messages can never share a graph_message_id.
  graph_message_id text unique,
  subject text,
  body_text text,
  sent_at timestamptz not null,
  from_email text,
  to_email text,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index resume_messages_resume_id_sent_at_idx on public.resume_messages (resume_id, sent_at);

alter table public.resume_messages enable row level security;
create policy "resume_messages full access for staff" on public.resume_messages
  for all using (public.is_staff()) with check (public.is_staff());
