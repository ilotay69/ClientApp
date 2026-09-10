-- ============================================================================
-- Replaces the plain yes/no m365_management_experience with a short
-- keyword list of the actual Microsoft cloud technologies the resume shows
-- evidence of (e.g. "Intune, Azure AD, Exchange Admin, SharePoint Admin")
-- -- a boolean can't carry that, so this is a straight swap rather than an
-- ALTER ... TYPE (existing true/false values have no meaningful keyword
-- equivalent to convert to; re-screening regenerates real values anyway).
--
-- Run this in the Supabase SQL Editor AFTER 082.
-- ============================================================================

alter table public.resumes
  drop column if exists m365_management_experience,
  add column if not exists m365_technologies text;
