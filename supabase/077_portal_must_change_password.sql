-- ============================================================================
-- Replaces the client-portal password reset flow's dependence on Supabase's
-- own "resetPasswordForEmail" magic-link email (fragile across this app's
-- recent domain changes, and the "nothing happens after the email" bug
-- reported in practice) with a simpler, self-contained design: staff-
-- triggered reset mints a new temp password directly (admin API, no email
-- link needed at all), the app emails it via Resend (not Supabase's own
-- mailer), and the portal login is forced to set a real password before
-- reaching anything else on next sign-in.
--
-- must_change_password is also set on brand-new portal logins (see
-- createPortalUser) for the same reason: a temp password should never be a
-- standing credential, whether it arrived by email or by staff relaying it
-- manually.
--
-- Run this in the Supabase SQL Editor AFTER 076.
-- ============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
