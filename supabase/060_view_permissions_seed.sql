-- Seed defaults for the 7 enum values added in 059 — run only after that
-- migration has been applied and committed.
--
-- view_lookups and view_analysis are pure decouplings: the Lookups page
-- was gated by manage_team ("add team members & change roles") and the
-- Analysis page was gated by manage_services ("edit the service
-- catalog") — neither has anything to do with viewing that page's data.
-- Copying each role's CURRENT enabled-status from the old key into the
-- new one preserves exactly whatever access exists right now (including
-- any custom toggling already done from /team/roles), rather than
-- guessing at a hardcoded true/false.
insert into public.role_permissions (role, permission, enabled)
select role, 'view_lookups'::public.permission_key, enabled
from public.role_permissions
where permission = 'manage_team'
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission, enabled)
select role, 'view_analysis'::public.permission_key, enabled
from public.role_permissions
where permission = 'manage_services'
on conflict (role, permission) do nothing;

-- Dashboard, Clients, Projects, the team-wide Tasks list, and Sales
-- Requests had NO permission gate at all until now — any signed-in user
-- could view them. Grant all three non-owner roles access so this
-- migration doesn't silently take anything away; tighten per-role from
-- /team/roles if desired.
insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'view_dashboard', true),
  ('tech', 'view_dashboard', true),
  ('sales_rep', 'view_dashboard', true),
  ('manager', 'view_clients', true),
  ('tech', 'view_clients', true),
  ('sales_rep', 'view_clients', true),
  ('manager', 'view_projects', true),
  ('tech', 'view_projects', true),
  ('sales_rep', 'view_projects', true),
  ('manager', 'view_team_tasks', true),
  ('tech', 'view_team_tasks', true),
  ('sales_rep', 'view_team_tasks', true),
  ('manager', 'view_sales_requests', true),
  ('tech', 'view_sales_requests', true),
  ('sales_rep', 'view_sales_requests', true)
on conflict (role, permission) do nothing;
