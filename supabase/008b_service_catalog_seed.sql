-- CG Technologies Client Tracker — service catalog permission seed
-- Run this AFTER 008_service_catalog.sql, as a separate query. Postgres
-- requires a newly ADD VALUE'd enum value ('manage_services', added in
-- 008) to be committed before it can be used — which running this as its
-- own query in the SQL editor satisfies.

insert into public.role_permissions (role, permission, enabled) values
  ('manager', 'manage_services', true),
  ('tech', 'manage_services', false)
on conflict (role, permission) do nothing;
