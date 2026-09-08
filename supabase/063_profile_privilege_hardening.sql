-- ============================================================================
-- Profile privilege hardening.
--
-- Run this in the Supabase SQL Editor AFTER 062.
--
-- Closes two live privilege-escalation holes. Both predate the client portal,
-- but the portal turns them from "an employee can over-promote themselves"
-- into "a customer can read every other customer's data", so they're fixed
-- first and separately.
-- ============================================================================


-- ============================================================================
-- 1. profiles UPDATE had no WITH CHECK — anyone could make themselves Owner.
--
-- 007_role_permissions.sql created the policy with a USING clause only:
--
--   for update using (auth.uid() = id or <is owner> or <has manage_team>)
--
-- When an UPDATE policy has no WITH CHECK, Postgres reuses the USING
-- expression as the check against the NEW row. `auth.uid() = id` is true both
-- before and after an UPDATE that changes any *other* column — including
-- `role`. And because no GRANT/REVOKE has ever been run in this project,
-- Supabase's default `GRANT ALL ON public.* TO authenticated` is still in
-- force, so any signed-in user could send
--
--   PATCH /rest/v1/profiles?id=eq.<their own id>   {"role": "owner"}
--
-- directly to PostgREST using the anon key that ships inside the browser
-- bundle, and become an Owner.
--
-- Adding WITH CHECK is necessary but NOT sufficient: WITH CHECK only ever
-- sees the NEW row, never OLD, so it cannot express "role must not change".
-- That requires a trigger, below.
-- ============================================================================
drop policy if exists "profiles updatable by self or manage_team" on public.profiles;
create policy "profiles updatable by self or manage_team" on public.profiles
  for update
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role = p.role
      where p.id = auth.uid() and rp.permission = 'manage_team' and rp.enabled
    )
  )
  with check (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role = p.role
      where p.id = auth.uid() and rp.permission = 'manage_team' and rp.enabled
    )
  );


-- ============================================================================
-- 2. The actual fix: a trigger guarding the privilege columns.
--
-- `role` is the only privilege column today; 064 extends this same function to
-- cover `client_id` once that column exists (a plpgsql body referencing
-- new.client_id would fail at runtime until then).
--
-- SECURITY DEFINER so the profiles lookups inside don't re-enter profiles' own
-- RLS. auth.uid() / auth.role() read the request's JWT claims out of
-- transaction settings, so they still report the *caller* inside a definer
-- function — being definer does not make us look like the owner to them.
-- ============================================================================
create or replace function public.profiles_guard_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role writes bypass RLS but NOT triggers. That's trusted server
  -- code (team provisioning, the cron jobs), so let it through — otherwise
  -- this trigger would break addTeamMember.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
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
        'Changing a profile role requires Owner or the manage_team permission';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege_columns on public.profiles;
create trigger profiles_guard_privilege_columns
  before update on public.profiles
  for each row execute procedure public.profiles_guard_privilege_columns();


-- ============================================================================
-- 3. handle_new_user() now fails closed.
--
-- The trigger on auth.users fires for EVERY new auth user, and until now took
-- `role` from the column default — 'tech' since 004_ops_restructure.sql. That
-- makes staff access the default outcome of merely existing in auth.users.
--
-- This matters because `POST /auth/v1/signup` is a *project-level* Supabase
-- endpoint: deleting the /sign-up page (done in this same change) does not
-- close it, and it is reachable by anyone holding the anon key from the
-- browser bundle. Azure SSO is the same story — until the provider is pinned
-- to CG's tenant, any Microsoft account anywhere lands here.
--
-- New rules, in order:
--   1. app_metadata.staff_role present  -> that role. Only the admin API can
--      set app_metadata, so this is the "an Owner deliberately created this
--      person" path. Note this is raw_app_meta_data, NOT raw_user_meta_data:
--      user_metadata is caller-supplied at signup and self-rewritable
--      afterwards via auth.updateUser({data}), so it can never be trusted for
--      an authorization decision.
--   2. A @cgtechnologies.com email      -> 'tech'. Normal staff SSO.
--   3. Anything else                    -> raise. No silent staff account.
--
-- Two Supabase dashboard settings still have to be changed by hand; neither is
-- expressible in SQL:
--   - Authentication -> Providers -> Email -> disable "Enable signup"
--   - Pin the Azure provider to CG's tenant id (not common/organizations)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'staff_role';
  resolved_role public.user_role;
begin
  if requested_role is not null then
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

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    new.email,
    resolved_role
  );
  return new;
end;
$$;

-- With the role now always chosen explicitly above, drop the default so a
-- future insert that forgets to set it errors instead of quietly minting staff.
alter table public.profiles alter column role drop default;
