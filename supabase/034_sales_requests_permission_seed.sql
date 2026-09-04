-- Seed manage_sales_requests for Manager and Tech — techs are the ones
-- actually creating most of these requests day to day, so they need it by
-- default, not just Owner (who always has every permission, hardcoded).
insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'manage_sales_requests', true),
  ('tech', 'manage_sales_requests', true)
on conflict (role, permission) do update set enabled = excluded.enabled;
