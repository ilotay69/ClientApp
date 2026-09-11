-- ============================================================================
-- Web Push subscriptions — one row per browser/device a staff member has
-- enabled notifications on (a user can have several: phone + laptop). No
-- singleton pattern here, unlike shared_mailbox_settings — this is
-- genuinely per-user, per-device data.
--
-- Run this in the Supabase SQL Editor AFTER 094.
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions (subscribe/unsubscribe from
-- their own device) — sending a push happens from the admin client
-- server-side, which bypasses RLS entirely, same as every other
-- notification path in this app.
create policy "push_subscriptions self access" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
