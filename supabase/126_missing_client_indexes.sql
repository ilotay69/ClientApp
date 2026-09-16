-- Two tables filtered by client_id on the Clients detail page (one of the
-- highest-traffic pages in the app) with no index to back that lookup —
-- every row gets scanned instead of looked up. touchpoints also orders by
-- due_date on the same page and the dashboard's touchpoints-due widget, so
-- that's a composite index rather than client_id alone.
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists touchpoints_client_due_idx on public.touchpoints (client_id, due_date);
