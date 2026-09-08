-- ============================================================================
-- TEMPORARY diagnostic — do not leave this in place.
--
-- "Database error creating new user" traced to handle_new_user() raising
-- P0001 "Self-registration is disabled" (confirmed in Postgres Logs). That
-- means new.raw_app_meta_data ->> 'portal_client_id' came back NULL even
-- though createPortalUser() passes app_metadata: { portal_client_id }.
--
-- The failing trigger fires AFTER INSERT on auth.users, in the same
-- transaction GoTrue's admin API used to create that row — so when the
-- trigger raises, that INSERT rolls back too. There is no row left to
-- inspect afterwards. This migration makes the exception message show
-- exactly what the trigger actually saw, so the real cause (rather than a
-- guess) is visible in Supabase -> Logs -> Postgres Logs after one more
-- failed attempt.
--
-- Run 067_handle_new_user_diagnostic_revert.sql once the cause is found —
-- this version must not stay live.
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
      'DEBUG self-registration rejected. email=% raw_app_meta_data=% raw_user_meta_data=%',
      new.email, new.raw_app_meta_data, new.raw_user_meta_data;
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
