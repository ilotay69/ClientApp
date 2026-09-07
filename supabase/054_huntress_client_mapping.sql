-- Same role ninjaone_organization_id/autotask_company_id play for their
-- own integrations — lets a client be linked to one Huntress organization
-- so EDR lookups can be scoped to a single client instead of only ever
-- being account-wide.
alter table public.clients add column if not exists huntress_organization_id integer;
