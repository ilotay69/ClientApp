-- New permission keys so every major page/menu has its own controllable
-- permission (an owner-run audit found several pages with no gate at all,
-- and two pages gated by a permission that had nothing to do with them —
-- see 060 for the follow-up seed). Enum additions only — a newly added
-- enum value can't be used in the same transaction it was created in
-- (Postgres 55P04), so seed rows using these live in 060 instead.
alter type public.permission_key add value if not exists 'view_lookups';
alter type public.permission_key add value if not exists 'view_analysis';
alter type public.permission_key add value if not exists 'view_dashboard';
alter type public.permission_key add value if not exists 'view_clients';
alter type public.permission_key add value if not exists 'view_projects';
alter type public.permission_key add value if not exists 'view_team_tasks';
alter type public.permission_key add value if not exists 'view_sales_requests';
