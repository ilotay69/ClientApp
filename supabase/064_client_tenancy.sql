-- ============================================================================
-- Client portal — tenancy column and the is_staff() security predicate.
--
-- Run this in the Supabase SQL Editor AFTER 063, and BEFORE 065.
--
-- IMPORTANT: run this as the role that OWNS public.profiles — i.e. from the
-- Supabase SQL Editor, which connects as `postgres`. See the note on
-- public.is_staff() below: run as a lesser role and the function is created
-- successfully but recurses at query time instead, which passes review and
-- then breaks every page in production.
-- ============================================================================


-- ============================================================================
-- 1. profiles.client_id — which company a portal login belongs to.
--
-- `on delete restrict`, deliberately NOT cascade: cascading would delete the
-- *profile* while leaving the auth.users row and its refresh token alive, so
-- the credential would keep working with no profile and no way to revoke it
-- from inside the app. Restrict forces the portal login to be removed first,
-- which is what "Team -> Client access -> Remove" does.
-- ============================================================================
alter table public.profiles
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

-- Both directions. `role = 'client' -> client_id not null` stops a portal
-- login with no tenant (which would be a login that can see nothing, or
-- worse, everything). The converse stops a *staff* row carrying a client_id,
-- which is the state a botched role change would otherwise leave behind.
alter table public.profiles
  drop constraint if exists profiles_client_id_matches_role;
alter table public.profiles
  add constraint profiles_client_id_matches_role
  check ((role = 'client') = (client_id is not null));

create index if not exists profiles_client_id_idx
  on public.profiles (client_id) where client_id is not null;


-- ============================================================================
-- 2. Extend the privilege guard from 063 to cover client_id.
--
-- client_id is now a privilege column: repointing it at another company is a
-- tenant hop, and it's the quieter version of the role escalation that 063
-- closed. Same shape as before, one more condition — the column simply didn't
-- exist when 063 ran, and a plpgsql body referencing new.client_id would have
-- failed at runtime.
-- ============================================================================
create or replace function public.profiles_guard_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role writes bypass RLS but NOT triggers. That's trusted server
  -- code (team + portal provisioning, the cron jobs), so let it through.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.client_id is distinct from old.client_id then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    ) and not exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role = p.role
      where p.id = auth.uid() and rp.permission = 'manage_team' and rp.enabled
    ) then
      raise exception
        'Changing a profile role or client_id requires Owner or the manage_team permission';
    end if;
  end if;

  return new;
end;
$$;


-- ============================================================================
-- 3. handle_new_user() — portal logins are BORN as clients.
--
-- Reads raw_app_meta_data, never raw_user_meta_data. app_metadata can only be
-- set through the admin API; user_metadata is caller-supplied at signup and
-- the signed-in user can rewrite their own at will via
-- auth.updateUser({ data }). A tenant identifier in user_metadata would be
-- attacker-controlled the moment anyone read it, so it lives in app_metadata
-- and the profile row — never the JWT.
--
-- Creating the profile in the right shape in the first place (rather than
-- inserting a staff row and UPDATEing it to 'client' afterwards) is what
-- removes the window where a failed second statement leaves a customer
-- holding a 'tech' profile with access to every other customer's data.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  portal_client_id text := new.raw_app_meta_data ->> 'portal_client_id';
  requested_role text := new.raw_app_meta_data ->> 'staff_role';
  resolved_role public.user_role;
  resolved_client_id uuid;
begin
  if portal_client_id is not null then
    -- A client-portal login, provisioned from Team -> Client access.
    resolved_role := 'client';
    resolved_client_id := portal_client_id::uuid;
    if not exists (select 1 from public.clients c where c.id = resolved_client_id) then
      raise exception 'portal_client_id % is not a client', portal_client_id;
    end if;
  elsif requested_role is not null then
    if requested_role not in ('owner', 'manager', 'tech', 'sales_rep') then
      raise exception 'staff_role must be a staff role, got %', requested_role;
    end if;
    resolved_role := requested_role::public.user_role;
  elsif lower(new.email) like '%@cgtechnologies.com' then
    resolved_role := 'tech';
  else
    raise exception
      'Self-registration is disabled. Accounts are created from Team -> Add member.';
  end if;

  insert into public.profiles (id, full_name, email, role, client_id)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    new.email,
    resolved_role,
    resolved_client_id
  );
  return new;
end;
$$;


-- ============================================================================
-- 4. public.is_staff() — the one security predicate.
--
-- Every blanket `auth.role() = 'authenticated'` policy becomes a call to this
-- (see 065). One definition, one meaning, one place to audit — rather than 52
-- hand-edited predicates that have to agree with each other forever.
--
-- Why SECURITY DEFINER: this function reads public.profiles, and after 065
-- profiles' own SELECT policy calls this function. What breaks that cycle is
-- that inside a definer function `current_user` becomes the function OWNER,
-- and a table's owner is exempt from that table's RLS. Two consequences:
--
--   * This migration MUST be run as the owner of public.profiles (postgres,
--     i.e. the SQL Editor). Run as a lesser role and you get
--     `42P17 infinite recursion detected in policy for relation "profiles"`
--     at query time, not at create time.
--   * NEVER run `alter table public.profiles force row level security` —
--     FORCE removes the owner's exemption and silently re-arms the recursion.
--
-- `stable`: it reads a table, so not immutable; but it must not be volatile
-- either, or Postgres re-evaluates it for every row of every one of the ~52
-- policy predicates instead of caching per statement.
--
-- `search_path = ''` with everything schema-qualified — what Supabase's own
-- function_search_path_mutable advisor wants. Without pg_temp named
-- explicitly, Postgres searches it first for relation names.
--
-- Allowlist, not `role <> 'client'`: a role added later is denied until
-- somebody edits this function on purpose. Keep it in step with STAFF_ROLES
-- in src/lib/permissions.ts.
-- ============================================================================
create or replace function public.is_staff()
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('owner', 'manager', 'tech', 'sales_rep')
  );
$$;

-- EXECUTE defaults to PUBLIC, and PostgREST would then expose this at
-- POST /rest/v1/rpc/is_staff to anonymous callers. `authenticated` genuinely
-- needs it: policy expressions execute as the invoking role.
revoke execute on function public.is_staff() from public;
revoke execute on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;


-- ============================================================================
-- 5. A client-portal role can never hold a permission.
--
-- 007 excluded only 'owner' (which is hardcoded to full access in app code).
-- Excluding 'client' at the database level matters because of the seed idiom
-- used in 060: `insert ... select role, '<new key>' from role_permissions
-- where permission = '<existing key>'` copies rows for whatever roles happen
-- to exist. Without this constraint, a future migration written that way
-- would silently grant a permission to every customer.
-- ============================================================================
alter table public.role_permissions
  drop constraint if exists role_permissions_role_not_owner;
alter table public.role_permissions
  add constraint role_permissions_role_is_editable_staff
  check (role in ('manager', 'tech', 'sales_rep'));


-- ============================================================================
-- 6. One Huntress organization maps to at most one client.
--
-- huntress_organization_id (054) is a bare integer with no FK and no
-- uniqueness, so two clients pointed at the same Huntress org would each see
-- the other's agents — with nothing in the schema to stop it. That was a
-- reporting oddity for internal staff; it's a cross-tenant leak once clients
-- read this data themselves.
--
-- If this statement fails with a uniqueness error, that duplicate mapping
-- already exists in live data and needs fixing before the portal ships —
-- which is exactly what we want to find out now:
--   select huntress_organization_id, count(*) from public.clients
--   where huntress_organization_id is not null
--   group by 1 having count(*) > 1;
-- ============================================================================
create unique index if not exists clients_huntress_organization_id_key
  on public.clients (huntress_organization_id)
  where huntress_organization_id is not null;
