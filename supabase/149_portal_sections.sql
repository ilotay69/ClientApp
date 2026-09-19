-- ============================================================================
-- Reshapes the client portal's section list (see PORTAL_PAGE_KEYS in
-- src/lib/portal-roles.ts) and seeds a permission row for every new one.
--
-- Why the seed matters: fetchAllowedPortalPages() only collects rows where
-- enabled = true, so a page key with NO row at all reads as "not granted"
-- for every role. That is not theoretical — 'reviews' was added to
-- PORTAL_PAGE_KEYS and shipped without a seed row, so the Quarterly Reviews
-- page has been unreachable for every client since the day it was written.
-- The insert below finally gives it one.
--
-- Every role gets every section enabled, matching 081's original stance:
-- this migration is a reshuffle of what the portal offers, not a decision
-- about who may see what. Staff narrow it per role from
-- Team -> Client access.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 'security' (Microsoft Secure Score) is gone from the portal. Its endpoint
-- half lives on as the 'huntress' section below.
delete from public.client_portal_permissions where portal_page = 'security';

insert into public.client_portal_permissions (client_role, portal_page, enabled)
select r.role, p.page, true
from unnest(enum_range(null::public.client_portal_role)) as r(role)
cross join (values
  ('tickets'),
  ('licences'),
  ('contracts'),
  ('devices'),
  ('huntress'),
  ('fortigate'),
  ('mailbox'),
  ('domain'),
  ('reviews'),
  ('onboarding')
) as p(page)
on conflict (client_role, portal_page) do nothing;

-- Any row whose page is no longer a known key would be dead weight that the
-- staff matrix can't display and no page ever reads. Nothing should match
-- after the delete above, but a stray row from a hand-edit would.
delete from public.client_portal_permissions
where portal_page not in (
  'tickets','licences','contracts','devices','huntress',
  'fortigate','mailbox','domain','reviews','onboarding'
);
