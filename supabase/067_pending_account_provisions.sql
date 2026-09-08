-- ============================================================================
-- Replaces app_metadata as the channel handle_new_user() uses to learn a new
-- account's intended role/client — that channel doesn't work.
--
-- 064 and 066 both had handle_new_user() read
-- new.raw_app_meta_data ->> 'portal_client_id' (or 'staff_role'), on the
-- assumption that the `app_metadata` parameter passed to
-- admin.auth.admin.createUser() lands there. Confirmed via Postgres Logs
-- (066's diagnostic) that it does not, in this project: raw_app_meta_data
-- arrived containing only GoTrue's own `{"provider": "email", "providers":
-- ["email"]}`, with no trace of anything the app passed in. raw_user_meta_data
-- (full_name) DID persist correctly in the same row, so this is specific to
-- app_metadata, not a general problem with the API call.
--
-- Practical consequence this also explains: staff created via Team -> Add
-- member as anything other than 'tech' on an @cgtechnologies.com address were
-- silently created as 'tech' regardless of the role picked — the trigger
-- never saw staff_role either, and fell through to the email-domain default.
--
-- Fix: a small table this app writes to itself (via the service-role client,
-- same as every other write here) immediately before calling createUser(),
-- keyed by email. The trigger looks it up by new.email — which DOES persist
-- reliably, it's the actual column being inserted — instead of trusting
-- anything GoTrue attaches to the request. It deletes its own row once
-- consumed, in the same transaction as the profiles insert, so a retry for
-- the same email starts clean.
-- ============================================================================

create table public.pending_account_provisions (
  email text primary key,
  client_id uuid references public.clients (id) on delete cascade,
  staff_role public.user_role,
  created_at timestamptz not null default now(),
  -- Exactly one of the two — this row exists only to say "the next signup
  -- for this email is a client portal login for X" or "...is staff with role
  -- Y", never both, never neither.
  constraint pending_account_provisions_exactly_one_target
    check ((client_id is not null) <> (staff_role is not null)),
  constraint pending_account_provisions_staff_role_not_client
    check (staff_role is null or staff_role <> 'client')
);

alter table public.pending_account_provisions enable row level security;
-- No policy for `authenticated` — service-role only, same posture as the
-- vendor credential tables. A signed-in user able to read or write this would
-- be able to grant themselves any role or client_id on their next sign-in.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_client_id uuid;
  pending_staff_role public.user_role;
  resolved_role public.user_role;
  resolved_client_id uuid;
begin
  select client_id, staff_role
    into pending_client_id, pending_staff_role
    from public.pending_account_provisions
    where email = lower(new.email);

  delete from public.pending_account_provisions where email = lower(new.email);

  if pending_client_id is not null then
    resolved_role := 'client';
    resolved_client_id := pending_client_id;
    -- Re-checked here even though the action already checked it: the client
    -- could in principle have been deleted in the gap between staging this
    -- row and the sign-up actually completing.
    if not exists (select 1 from public.clients c where c.id = resolved_client_id) then
      raise exception 'pending client_id % is not a client', resolved_client_id;
    end if;
  elsif pending_staff_role is not null then
    resolved_role := pending_staff_role;
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
