-- Seed defaults for the two enum values added in 046 — run only after
-- that migration has been applied and committed.
--
-- Sales Rep: granted exactly what the role is for (sales requests,
-- relationship touchpoints) — everything else starts denied, since the
-- Owner can grant more from /team/roles as needed.
insert into public.role_permissions (role, permission, enabled) values
  ('sales_rep', 'manage_team', false),
  ('sales_rep', 'manage_roles', false),
  ('sales_rep', 'view_team_wide', false),
  ('sales_rep', 'manage_clients', false),
  ('sales_rep', 'manage_projects', false),
  ('sales_rep', 'manage_touchpoints', true),
  ('sales_rep', 'delete_tasks', false),
  ('sales_rep', 'manage_integrations', false),
  ('sales_rep', 'manage_sales_requests', true),
  ('sales_rep', 'manage_services', false),
  ('sales_rep', 'view_domain_health', false)
on conflict (role, permission) do nothing;

-- Domain Health had no permission gate at all until now — grant it to the
-- two existing non-owner roles so this migration doesn't silently take
-- away access anyone already had. Tighten from /team/roles if desired.
insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'view_domain_health', true),
  ('tech', 'view_domain_health', true)
on conflict (role, permission) do nothing;
