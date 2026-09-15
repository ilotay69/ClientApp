-- Lets a user pick their own Autotask Resource explicitly, instead of
-- relying on full_name fuzzily matching an Autotask resource's name
-- (fetchMyOpenAutotaskTickets in src/lib/my-tickets.ts) — a mismatch there
-- silently showed "no open tickets" with no way to tell why. Storing the
-- numeric id (not the name) means a later Autotask rename can't break the
-- match again. Covered by the existing "profiles updatable by self or
-- admin" RLS policy — no new policy needed.
alter table public.profiles add column autotask_resource_id integer;

comment on column public.profiles.autotask_resource_id is
  'Autotask Resource id this profile maps to, for live Autotask lookups (My Tickets, Team Hours) — set by the user themselves under Settings, since Autotask has no reverse link back to this app.';
