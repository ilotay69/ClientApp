-- Copies each role's CURRENT enabled-status for manage_integrations into
-- the new manage_client_mapping key, so nobody loses access they already
-- had the moment this permission splits out — same reasoning as 060's
-- view_lookups/view_analysis decoupling.
--
-- Run this in the Supabase SQL Editor AFTER 136.
insert into public.role_permissions (role, permission, enabled)
select role, 'manage_client_mapping'::public.permission_key, enabled
from public.role_permissions
where permission = 'manage_integrations'
on conflict (role, permission) do nothing;
