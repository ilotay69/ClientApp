-- CG Technologies Client Tracker — owner-editable permission matrix
-- Run this in the Supabase SQL Editor AFTER 006_task_status_notes.sql.
--
-- Renames the "director" role to "owner" (a label-only change — Postgres's
-- ALTER TYPE ... RENAME VALUE only changes the display label for a stable
-- enum OID, existing rows and any policy already bound to that OID keep
-- working) and adds a role_permissions table so the Owner can grant/revoke
-- specific capabilities per role from a new /team/roles page, instead of
-- everything being hardcoded to one role check. Owner itself is NOT driven
-- by this table — the app code hardcodes 'owner' to full access (see
-- src/lib/permissions.ts) so an Owner can never accidentally lock
-- themselves out. Also widens the profiles UPDATE policy so a role granted
-- 'manage_team' can actually change other members' roles (see step 5) —
-- previously that was hardcoded to self-or-owner at the database layer,
-- which would otherwise silently defeat a granted manage_team permission.
--
-- Run top to bottom as separate statements (don't wrap in one BEGIN/COMMIT
-- — the enum rename and the new permission_key type need to be visible to
-- the later CREATE TABLE/POLICY statements in this same script).

-- ============================================================================
-- 1. Rename the role label. Existing rows with role = 'director' become
--    role = 'owner' automatically — this only changes the enum's display
--    label, not its underlying OID.
-- ============================================================================
alter type public.user_role rename value 'director' to 'owner';

-- ============================================================================
-- 2. Permission keys — one per distinct feature area the Owner can toggle
--    per role. 'owner' is intentionally excluded (see the check constraint
--    below) since it's hardcoded full-access in app code, not table-driven.
-- ============================================================================
create type public.permission_key as enum (
  'manage_team',
  'manage_roles',
  'manage_service_catalog',
  'view_team_wide',
  'manage_clients',
  'manage_projects',
  'manage_touchpoints',
  'delete_tasks'
);

-- ============================================================================
-- 3. role_permissions — Owner-editable matrix for 'manager' and 'tech'.
-- ============================================================================
create table public.role_permissions (
  role public.user_role not null,
  permission public.permission_key not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, permission),
  constraint role_permissions_role_not_owner check (role <> 'owner')
);

create trigger role_permissions_set_updated_at before update on public.role_permissions
  for each row execute procedure public.set_updated_at();

alter table public.role_permissions enable row level security;

-- Mirrors "profiles readable by authenticated" — the matrix isn't secret,
-- only editing it is restricted.
create policy "role_permissions readable by authenticated" on public.role_permissions
  for select using (auth.role() = 'authenticated');

-- Mirrors the owner-only half of the profiles UPDATE policy (see step 5
-- below) — writes to the matrix itself are owner-only, full stop.
create policy "role_permissions insertable by owner" on public.role_permissions
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );
create policy "role_permissions updatable by owner" on public.role_permissions
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );
create policy "role_permissions deletable by owner" on public.role_permissions
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ============================================================================
-- 4. Seed defaults. Owner needs no rows (hardcoded full access in code).
--    Manager gets everything except the two owner-tier admin actions; Tech
--    gets nothing until the Owner opts them into specific permissions from
--    the /team/roles page.
-- ============================================================================
insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'manage_team', false),
  ('manager', 'manage_roles', false),
  ('manager', 'manage_service_catalog', true),
  ('manager', 'view_team_wide', true),
  ('manager', 'manage_clients', true),
  ('manager', 'manage_projects', true),
  ('manager', 'manage_touchpoints', true),
  ('manager', 'delete_tasks', true),
  ('tech', 'manage_team', false),
  ('tech', 'manage_roles', false),
  ('tech', 'manage_service_catalog', false),
  ('tech', 'view_team_wide', false),
  ('tech', 'manage_clients', false),
  ('tech', 'manage_projects', false),
  ('tech', 'manage_touchpoints', false),
  ('tech', 'delete_tasks', false)
on conflict (role, permission) do nothing;

-- ============================================================================
-- 5. Widen the profiles UPDATE policy. It previously only allowed a self
--    -update or role = 'owner' (nee 'admin') — if left as-is, an Owner
--    granting 'manage_team' to Manager/Tech from the new /team/roles page
--    would silently fail at the database layer the moment that role tried
--    to actually change someone's role via updateMemberRole, even though
--    the app-level check passed. This is the one RLS change this migration
--    makes — it's fixing a direct conflict with the feature being added,
--    not a general RLS rewrite.
-- ============================================================================
drop policy if exists "profiles updatable by self or admin" on public.profiles;
create policy "profiles updatable by self or manage_team" on public.profiles
  for update using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role = p.role
      where p.id = auth.uid() and rp.permission = 'manage_team' and rp.enabled
    )
  );
