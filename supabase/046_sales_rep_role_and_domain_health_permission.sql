-- New "Sales Rep" role, and a new permission key for the previously
-- ungated Domain Health tool. Just the enum additions here — seed rows
-- using either new value must live in a later migration (Postgres won't
-- let a new enum value be used in the same transaction it was added in).
alter type public.user_role add value if not exists 'sales_rep';
alter type public.permission_key add value if not exists 'view_domain_health';
alter type public.permission_key add value if not exists 'manage_touchpoints';
