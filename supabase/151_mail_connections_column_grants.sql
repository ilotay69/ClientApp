-- ============================================================================
-- mail_connections holds each staff member's Microsoft Graph access_token and
-- refresh_token. Today the table grants `authenticated` and `anon` the full
-- set (verified: relacl is authenticated=arwdDxtm), and its only policy is
--
--     "mail_connections owned by self"  FOR ALL TO public
--     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--
-- RLS is row-level: it can hide another person's row, but it cannot hide a
-- column within a row you are allowed to see. So any signed-in staff member
-- can run this from the browser with the publishable key:
--
--     GET /rest/v1/mail_connections?select=refresh_token
--
-- and get back a Microsoft Graph refresh token carrying Mail.ReadWrite,
-- Calendars.Read and offline_access against their real corporate mailbox,
-- valid until explicitly revoked. FOR ALL also means they can UPDATE those
-- token columns and DELETE the row.
--
-- It is their own mailbox, so the direct severity is moderate. The shape is
-- what's wrong: a token minted by our server-side OAuth flow and deliberately
-- kept in an admin-only table is reachable by page JavaScript, which puts it
-- one XSS or one malicious browser extension away from someone who is not
-- that staff member.
--
-- The fix is column-level grants. Verified safe before writing this: only
-- FOUR callers touch this table with the request-scoped (anon-key) client,
-- and all four use explicit non-secret column lists --
--
--   settings/mail/page.tsx:19      select mailbox_email, connected_at, last_synced_at
--   recruitment/page.tsx:157       select resume_folder_name, resume_sync_last_synced_at
--   my-todo/page.tsx:170           select review_excludes, review_lookback_days,
--                                         sync_excluded_senders
--   recruitment/actions.ts:36      update resume_folder_name
--
-- Every token read, every token write, the OAuth callback upsert, the
-- disconnect delete, and all six dashboard/actions.ts call sites already go
-- through createAdminClient() (service_role), which is untouched below.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

begin;

-- anon has no legitimate access at all. RLS already denies it (auth.uid() is
-- null for an unauthenticated request, so the policy never matches), but a
-- grant that nothing needs is a grant that can be leaned on later.
revoke all on public.mail_connections from anon;

-- Dropped wholesale and re-granted per column. Postgres has no "revoke one
-- column" -- a table-level grant outranks any column-level grant, so the
-- table-level one has to go first or the column list means nothing.
revoke all on public.mail_connections from authenticated;

-- user_id is in the list because every one of the four callers filters with
-- .eq("user_id", ...), and Postgres requires SELECT on a column to use it in
-- a WHERE clause -- omit it and all four break with 42501.
grant select (
  user_id,
  mailbox_email,
  connected_at,
  last_synced_at,
  review_excludes,
  review_lookback_days,
  sync_excluded_senders,
  resume_folder_name,
  resume_sync_last_synced_at
) on public.mail_connections to authenticated;

-- The single request-scoped write: the watched-folder name on Recruitment.
grant update (resume_folder_name) on public.mail_connections to authenticated;

-- Deliberately NOT granted, and each for a reason:
--   access_token, refresh_token, expires_at -- the secrets this is all about
--   dismissed_appointment_subjects, review_subfolder, snapshot_synced_at
--     -- only ever read and written through createAdminClient()
-- INSERT and DELETE are not re-granted either: FOR ALL handed them out, but
-- the OAuth callback's upsert and the disconnect delete are both admin-side.

drop policy "mail_connections owned by self" on public.mail_connections;

create policy "mail_connections readable by owner"
  on public.mail_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "mail_connections preferences updatable by owner"
  on public.mail_connections for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;

-- Verification. Expect authenticated to be ABSENT from the table-level acl
-- and present in the column-level one for exactly the ten column/privilege
-- pairs granted above.
--
--   select relacl::text from pg_class
--    where oid = 'public.mail_connections'::regclass;
--
--   select a.attname, c.privilege_type
--     from information_schema.column_privileges c
--     join pg_attribute a
--       on a.attrelid = 'public.mail_connections'::regclass
--      and a.attname = c.column_name
--    where c.table_name = 'mail_connections'
--      and c.grantee = 'authenticated'
--    order by a.attname, c.privilege_type;
--
-- And the behavioural check, from the browser console while signed in as
-- staff -- this must now fail with 42501 "permission denied for column":
--
--   await (await fetch('/rest/v1/mail_connections?select=refresh_token', {
--     headers: { apikey: <publishable key>, Authorization: 'Bearer ' + <token> }
--   })).text()
