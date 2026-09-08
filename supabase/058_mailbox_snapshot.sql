-- ============================================================================
-- mailbox_snapshot_messages — a local, per-user mirror of mailbox-wide
-- message metadata (not full bodies), kept fresh by a background sync
-- (see src/lib/mailbox-snapshot.ts and /api/mailbox-snapshot-sync) instead
-- of the mailbox review fetching live from Graph on every click. This is
-- what lets the review reflect messages regardless of which folder the
-- user has since filed them into, without re-scanning the whole mailbox
-- interactively every time.
-- ============================================================================
create table public.mailbox_snapshot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  graph_message_id text not null,
  conversation_id text not null,
  subject text,
  from_name text,
  from_email text,
  to_name text,
  to_email text,
  received_at timestamptz not null,
  sent_at timestamptz,
  web_link text,
  body_preview text,
  parent_folder_id text,
  is_flagged boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, graph_message_id)
);

create index mailbox_snapshot_messages_user_received_idx
  on public.mailbox_snapshot_messages (user_id, received_at desc);
create index mailbox_snapshot_messages_user_conversation_idx
  on public.mailbox_snapshot_messages (user_id, conversation_id);

alter table public.mailbox_snapshot_messages enable row level security;

create policy "mailbox_snapshot_messages owned by self" on public.mailbox_snapshot_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- mail_connections: sync checkpoint (separate from last_synced_at, which
-- belongs to the older Quote/Project category sync) and a per-user list
-- of senders that should never be written to mailbox_snapshot_messages at
-- all, not just hidden from the analysis output.
alter table public.mail_connections
  add column snapshot_synced_at timestamptz,
  add column sync_excluded_senders text;
