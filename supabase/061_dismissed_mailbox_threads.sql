-- ============================================================================
-- dismissed_mailbox_threads — per-user "don't show this recommendation
-- again" list for the mailbox review. Keyed by conversation, but records
-- WHICH message was current when dismissed (dismissed_message_id) — if
-- that same thread later gets a genuinely new reply, the thread's latest
-- message no longer matches what was dismissed, so it resurfaces instead
-- of staying hidden forever. One row per conversation per user; dismissing
-- again just overwrites the previous dismissed_message_id.
-- ============================================================================
create table public.dismissed_mailbox_threads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id text not null,
  dismissed_message_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.dismissed_mailbox_threads enable row level security;

create policy "dismissed_mailbox_threads owned by self" on public.dismissed_mailbox_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
