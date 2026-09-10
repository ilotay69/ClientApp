-- ============================================================================
-- One more AI-extracted screening signal: m365_management_experience —
-- does the candidate have hands-on Microsoft 365 management/configuration
-- experience (admin center, Exchange Admin, Intune, Azure AD/Entra,
-- SharePoint admin, etc.), replacing the recruitment table's Comment
-- column.
--
-- Run this in the Supabase SQL Editor AFTER 081.
-- ============================================================================

alter table public.resumes
  add column if not exists m365_management_experience boolean;
