-- Seed the Proposals permissions added in 127. Manager and Sales Rep get
-- both by default — writing and sending proposals is their job. Techs get
-- neither: they can raise an internal sales request (manage_sales_requests,
-- seeded in 034) and a rep turns it into a priced proposal from there.
--
-- Owner always holds every permission, hardcoded in getMyPermissions — it's
-- never read from this table, and the role_permissions_role_not_owner check
-- constraint would reject the row anyway.
--
-- Run this in the Supabase SQL Editor AFTER 127.
insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'view_proposals', true),
  ('manager', 'manage_proposals', true),
  ('sales_rep', 'view_proposals', true),
  ('sales_rep', 'manage_proposals', true)
on conflict (role, permission) do update set enabled = excluded.enabled;
