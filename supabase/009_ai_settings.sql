-- CG Technologies Client Tracker — AI provider settings
-- Run this in the Supabase SQL Editor AFTER 008b_service_catalog_seed.sql.
--
-- Moves the AI Insights provider/API key from a deploy-time env var
-- (ANTHROPIC_API_KEY) into an in-app, switchable setting — one row per
-- supported provider, so switching back and forth doesn't lose a
-- previously entered key.
--
-- Security: this table gets RLS enabled but deliberately NO policy for
-- `authenticated` — API keys must never be selectable by a signed-in
-- user's own session. Every read/write goes through the service-role
-- admin client (createAdminClient()), same as the reminders/mail-sync
-- cron jobs already do.
--
-- The new 'manage_ai_settings' permission has no seed rows below on
-- purpose: a missing role_permissions row already means "false", and
-- Owner is hardcoded to full access in app code — so nothing needs
-- seeding, no INSERT uses the newly-added enum value in this same
-- script, no ADD VALUE/same-transaction restriction to worry about
-- (unlike 008, which needed a two-step split for exactly this reason).

create type public.ai_provider as enum ('anthropic', 'openai');

create table public.ai_provider_settings (
  provider public.ai_provider primary key,
  api_key text,
  model text,
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger ai_provider_settings_set_updated_at before update on public.ai_provider_settings
  for each row execute procedure public.set_updated_at();

alter table public.ai_provider_settings enable row level security;
-- No policies added — RLS with zero policies means zero access for
-- `authenticated`. Only the service role (which bypasses RLS) can touch
-- this table.

alter type public.permission_key add value if not exists 'manage_ai_settings';
