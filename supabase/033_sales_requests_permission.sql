-- New permission for the Sales Requests pipeline. Own script — a value
-- added via ALTER TYPE ... ADD VALUE can't be used (e.g. in an INSERT) in
-- the same script that adds it (Postgres 55P04); seeding role_permissions
-- rows for it happens in the next migration.
alter type public.permission_key add value if not exists 'manage_sales_requests';
