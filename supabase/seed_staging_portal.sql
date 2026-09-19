-- Makes the client portal's cached sections actually render in STAGING.
--
-- Why this is needed: staging is deliberately credential-free, which is
-- what makes "integrations behave like production" safe there. The cost is
-- that every vendor-backed portal section reports "isn't set up for your
-- account yet", so the new portal can't be reviewed at all.
--
-- The three sections below read CACHED Postgres tables rather than a live
-- vendor API, so they can be seeded. Tickets, Contract & Time, FortiGate
-- and Endpoint Protection cannot: they call Autotask, FortiCloud and
-- Huntress live, using credentials staging does not hold and must not.
-- Those four stay unverifiable here by design - check them with a staff
-- preview against production once this reaches main.
--
-- STAGING ONLY. Refuses to run anywhere that looks like production.

do $$
begin
  if not exists (select 1 from public.clients where name like '%(STAGING)%') then
    raise exception
      'Refusing to run: no "(STAGING)" marker clients found. seed_staging_portal.sql is for the staging project only.';
  end if;
end $$;

-- The 12 oldest seeded clients get vendor mappings. Not all 95: a portal
-- that renders for every client tells you nothing about how the "not set
-- up" state looks, and that state is what most real clients will see.
with targets as (
  select id, row_number() over (order by created_at) as n
  from public.clients
  where name not like '%(STAGING)%'
  limit 12
)
update public.clients c
set
  -- ninjaone_devices rows seeded earlier carry no organization id, so the
  -- portal's `linked` check is all this needs to satisfy.
  ninjaone_organization_id = 90000 + t.n,
  m365_tenant_id = 'fake-tenant-' || t.n || '-0000-0000-0000-000000000000',
  huntress_organization_id = 80000 + t.n
from targets t
where c.id = t.id;

-- ------------------------------------------------------- licence summary
-- Deliberately includes ONE free/unlimited SKU with 1,000,000 seats per
-- client, so the ">10,000 seats are hidden" toggle has something to hide
-- and can actually be exercised.
delete from public.m365_license_summary
where client_id in (select id from public.clients where m365_tenant_id like 'fake-tenant-%');

insert into public.m365_license_summary
  (client_id, sku_part_number, consumed_units, enabled_units, suspended_units, capability_status, last_synced_at)
select
  c.id,
  s.sku,
  greatest(0, s.enabled - (s.slack * ((row_number() over (partition by s.sku order by c.created_at))::int % 4))),
  s.enabled,
  0,
  'Enabled',
  now()
from public.clients c
cross join (values
  ('SPB',                        25, 2),   -- Business Premium
  ('O365_BUSINESS_ESSENTIALS',   15, 3),   -- Business Basic
  ('ENTERPRISEPACK',             10, 1),   -- E3
  ('EXCHANGESTANDARD',            8, 2),
  ('POWER_BI_STANDARD',     1000000, 0)    -- free, hidden by the 10k rule
) as s(sku, enabled, slack)
where c.m365_tenant_id like 'fake-tenant-%';

-- --------------------------------------------------------- mailbox usage
-- Spread across the Healthy / Warning / Critical bands on purpose, so the
-- status filter and the red-amber-green counts all have rows to land on.
delete from public.m365_mailbox_usage
where client_id in (select id from public.clients where m365_tenant_id like 'fake-tenant-%');

insert into public.m365_mailbox_usage
  (client_id, user_principal_name, display_name, storage_used_bytes, prohibit_send_receive_quota_bytes, last_synced_at)
select
  c.id,
  'nobody+mb' || i || '.' || left(c.id::text, 4) || '@example.invalid',
  (array['Dana Whitfield','Chris Okonkwo','Pat Lindqvist','Robin Amari','Sky Delacroix',
         'Jo Vasquez','Lee Barrington','Ash Nakamura'])[1 + (i % 8)],
  -- 50 GB quota; used lands between roughly 20% and 98%.
  ((50 * 1024^3) * ((20 + (i * 13) % 79)::numeric / 100))::bigint,
  (50 * 1024^3)::bigint,
  now()
from public.clients c
cross join generate_series(1, 8) i
where c.m365_tenant_id like 'fake-tenant-%';

-- ------------------------------------------------------------------ check
select
  (select count(*) from public.clients where m365_tenant_id like 'fake-tenant-%') as mapped_clients,
  (select count(*) from public.m365_license_summary) as licence_rows,
  (select count(*) from public.m365_mailbox_usage) as mailbox_rows;
