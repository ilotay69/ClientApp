-- ============================================================================
-- Deny-by-default RLS: every "any signed-in user" policy becomes "staff only".
--
-- Run this in the Supabase SQL Editor AFTER 064.
--
-- Until now this app's RLS said `auth.role() = 'authenticated'` on ~28 tables,
-- encoding the assumption spelled out in schema.sql:150 — "this is a small
-- trusted internal team: every signed-in team member can read and edit every
-- record". Client-portal logins break that assumption: they are authenticated
-- Supabase users too, they hold the NEXT_PUBLIC_SUPABASE_ANON_KEY that ships
-- in the browser bundle, and they can therefore query PostgREST directly,
-- bypassing Next.js and src/lib/permissions.ts entirely.
--
-- So `authenticated` is replaced with public.is_staff() (see 064) — 33 live
-- policies, 55 predicate expressions. `for all using (X) with check (X)` is
-- two predicates on one line, which is why a grep for the old string
-- undercounts.
--
-- This is a strict no-op for owner/manager/tech/sales_rep. The only accounts
-- that lose access are role='client', which have none today.
--
-- Portal data does NOT come through these policies. A client gets zero direct
-- table access; every portal read goes through the service-role client in a
-- Server Component or action, hard-scoped to the client_id on the signed-in
-- user's own profile (see src/lib/portal.ts). RLS here is the backstop that
-- makes a mistake in that code non-catastrophic.
--
-- `alter policy` rather than drop+create: atomic, and it cannot leave a table
-- momentarily policy-free. Note a policy's command type is fixed at creation,
-- so the groups below differ in whether they take USING, WITH CHECK, or both
-- — a FOR SELECT policy rejects WITH CHECK.
-- ============================================================================


-- ============================================================================
-- 1. FOR ALL policies — both USING and WITH CHECK (20 policies, 40 predicates)
-- ============================================================================
alter policy "clients full access for authenticated" on public.clients
  using (public.is_staff()) with check (public.is_staff());
alter policy "projects full access for authenticated" on public.projects
  using (public.is_staff()) with check (public.is_staff());
alter policy "touchpoints full access for authenticated" on public.touchpoints
  using (public.is_staff()) with check (public.is_staff());
alter policy "service_catalog full access for authenticated" on public.service_catalog
  using (public.is_staff()) with check (public.is_staff());
alter policy "client_service_checks full access for authenticated" on public.client_service_checks
  using (public.is_staff()) with check (public.is_staff());
alter policy "task_assignees full access for authenticated" on public.task_assignees
  using (public.is_staff()) with check (public.is_staff());
alter policy "services full access for authenticated" on public.services
  using (public.is_staff()) with check (public.is_staff());
alter policy "client_services full access for authenticated" on public.client_services
  using (public.is_staff()) with check (public.is_staff());
alter policy "client_contacts full access for authenticated" on public.client_contacts
  using (public.is_staff()) with check (public.is_staff());
alter policy "client_interactions full access for authenticated" on public.client_interactions
  using (public.is_staff()) with check (public.is_staff());
alter policy "autotask_tickets full access for authenticated" on public.autotask_tickets
  using (public.is_staff()) with check (public.is_staff());
alter policy "autotask_contract_services full access for authenticated" on public.autotask_contract_services
  using (public.is_staff()) with check (public.is_staff());
alter policy "ninjaone_devices full access for authenticated" on public.ninjaone_devices
  using (public.is_staff()) with check (public.is_staff());
alter policy "m365_license_summary full access for authenticated" on public.m365_license_summary
  using (public.is_staff()) with check (public.is_staff());
alter policy "m365_secure_score full access for authenticated" on public.m365_secure_score
  using (public.is_staff()) with check (public.is_staff());
alter policy "m365_secure_score_gaps full access for authenticated" on public.m365_secure_score_gaps
  using (public.is_staff()) with check (public.is_staff());
alter policy "sales_requests full access for authenticated" on public.sales_requests
  using (public.is_staff()) with check (public.is_staff());
alter policy "sales_request_notes full access for authenticated" on public.sales_request_notes
  using (public.is_staff()) with check (public.is_staff());
alter policy "task_notes full access for authenticated" on public.task_notes
  using (public.is_staff()) with check (public.is_staff());
alter policy "project_notes full access for authenticated" on public.project_notes
  using (public.is_staff()) with check (public.is_staff());


-- ============================================================================
-- 2. FOR SELECT policies — USING only (4 policies, 4 predicates)
--
-- reminder_log's live policy is the one in 004_ops_restructure.sql:180, not
-- the one in schema.sql:189 — 004 dropped and recreated the table, so the
-- original statement no longer exists in the database.
-- ============================================================================
alter policy "email_links readable by authenticated" on public.email_links
  using (public.is_staff());
alter policy "reminder_log readable by authenticated" on public.reminder_log
  using (public.is_staff());
alter policy "role_permissions readable by authenticated" on public.role_permissions
  using (public.is_staff());
alter policy "suggestions readable by authenticated" on public.suggestions
  using (public.is_staff());


-- ============================================================================
-- 3. profiles SELECT — the one policy that is NOT simply is_staff().
--
-- A client-portal login must still be able to read its OWN profile row: that
-- row is where its role and client_id live, so getMyPermissions() and
-- getPortalContext() both depend on it. Everyone else's row stays staff-only.
--
-- This also keeps the policies on other tables working. Several of them
-- subquery profiles from inside their own predicate — role_permissions'
-- owner-only write policies (007:68-81) and the profiles UPDATE policy
-- (063) all do `exists (select 1 from public.profiles p where p.id =
-- auth.uid() ...)` — and a subquery inside a policy DOES get the target
-- table's RLS applied. The `id = auth.uid()` branch is what lets those keep
-- resolving.
-- ============================================================================
alter policy "profiles readable by authenticated" on public.profiles
  using (public.is_staff() or id = auth.uid());


-- ============================================================================
-- 4. FOR UPDATE — USING and WITH CHECK (1 policy, 2 predicates)
-- ============================================================================
alter policy "suggestions updatable by authenticated" on public.suggestions
  using (public.is_staff()) with check (public.is_staff());


-- ============================================================================
-- 5. tasks — mixed predicates (4 policies, 5 predicates).
--
-- These are NOT the blanket form: 023_task_privacy.sql combined the
-- authenticated check with the is_personal check, so a search for the plain
-- `auth.role() = 'authenticated'` string skips them. The personal-task half
-- is preserved exactly as-is.
--
-- The live policies are 023's four, not the "tasks full access for
-- authenticated" one from 004 — 023:14 dropped that.
-- ============================================================================
alter policy "tasks readable" on public.tasks
  using (public.is_staff() and (not is_personal or created_by = auth.uid()));
alter policy "tasks insertable" on public.tasks
  with check (public.is_staff() and (not is_personal or created_by = auth.uid()));
alter policy "tasks updatable" on public.tasks
  using (public.is_staff() and (not is_personal or created_by = auth.uid()))
  with check (public.is_staff() and (not is_personal or created_by = auth.uid()));
alter policy "tasks deletable" on public.tasks
  using (public.is_staff() and (not is_personal or created_by = auth.uid()));


-- ============================================================================
-- 6. storage.objects — the client-documents bucket (3 policies, 3 predicates).
--
-- This is the bucket holding client quotes and signed documents, so it must
-- not be skipped. It is also the awkward one: storage.objects is owned by
-- `supabase_storage_admin`, not `postgres`. From the SQL Editor these ALTERs
-- normally succeed, but if they fail with a permissions error, either run
--     set role supabase_storage_admin;
-- first (then `reset role;` afterwards), or make the same edit through
-- Storage -> Policies in the dashboard. Do not move on until these three are
-- actually changed — verify with the query at the bottom of this file.
-- ============================================================================
alter policy "client-documents readable by authenticated" on storage.objects
  using (bucket_id = 'client-documents' and public.is_staff());
alter policy "client-documents insertable by authenticated" on storage.objects
  with check (bucket_id = 'client-documents' and public.is_staff());
alter policy "client-documents deletable by authenticated" on storage.objects
  using (bucket_id = 'client-documents' and public.is_staff());


-- ============================================================================
-- Deliberately NOT changed
--
--   mail_connections            (002:49)  } already scoped to auth.uid() =
--   mailbox_snapshot_messages   (058:37)  } user_id — per-user, and a portal
--   dismissed_mailbox_threads   (061:20)  } login simply never has a row
--   role_permissions insert/update/delete (007:68-81) — already owner-only
--   profiles updatable by self or manage_team (063) — already scoped, and
--     backed by the privilege-column trigger from 063/064
--
-- Verification — this should return ZERO rows once the migration has run:
--
--   select schemaname, tablename, policyname, qual, with_check
--   from pg_policies
--   where qual like '%authenticated%' or with_check like '%authenticated%';
--
-- (Note pg_policies renders auth.role() = 'authenticated' with casts, so
-- match on the substring rather than the exact expression.)
-- ============================================================================
