-- ============================================================================
-- Which portal pages each client-portal sub-role (080) can see. Seeded so
-- every role sees everything by default — identical to today's behavior —
-- until an Owner deliberately narrows one from Team -> Client access.
--
-- Read via the service-role client only (fetchAllowedPortalPages, portal.ts)
-- — same reasoning as every other portal read in this app: a role='client'
-- login has no useful direct table access under RLS at all, so the only
-- policy needed here is staff management access.
--
-- Run this in the Supabase SQL Editor AFTER 080.
-- ============================================================================

create table public.client_portal_permissions (
  client_role public.client_portal_role not null,
  portal_page text not null,
  enabled boolean not null default true,
  primary key (client_role, portal_page)
);

alter table public.client_portal_permissions enable row level security;
create policy "client_portal_permissions full access for staff" on public.client_portal_permissions
  for all using (public.is_staff()) with check (public.is_staff());

insert into public.client_portal_permissions (client_role, portal_page, enabled)
select r.role, p.page, true
from unnest(enum_range(null::public.client_portal_role)) as r(role)
cross join (values ('tickets'), ('contracts'), ('devices'), ('security'), ('licences')) as p(page)
on conflict (client_role, portal_page) do nothing;
