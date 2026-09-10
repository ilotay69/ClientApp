-- ============================================================================
-- Client-portal sub-roles — Client Tech / Client Manager / Client Owner —
-- let staff control which portal pages (Tickets, Contracts, Devices,
-- Security, Microsoft 365) each kind of client contact can see. Overview
-- stays visible to every portal login regardless of sub-role — it's the
-- landing page, so there's never a zero-page dead end.
--
-- Entirely separate from the staff role_permissions system (Team ->
-- Roles & permissions) on purpose: profiles.role stays 'client' for every
-- portal login no matter its sub-role, so is_staff() and the whole
-- staff/client boundary this app already relies on everywhere is
-- completely untouched by this.
--
-- Run this in the Supabase SQL Editor AFTER 079.
-- ============================================================================

create type public.client_portal_role as enum ('client_tech', 'client_manager', 'client_owner');

alter table public.profiles
  add column if not exists client_role public.client_portal_role not null default 'client_owner';

comment on column public.profiles.client_role is
  'Only meaningful when role = ''client'' -- which portal pages this login can see (see client_portal_permissions). Defaults to client_owner (full access) so no existing portal login is narrowed by this migration alone.';
