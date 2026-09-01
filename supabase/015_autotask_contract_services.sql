-- Autotask's contracted/billed services per client, distinct from this
-- app's own manually-attached Service Catalog services. Same replace-on-
-- sync cache pattern as autotask_tickets.
create table public.autotask_contract_services (
  id integer primary key, -- Autotask's own ContractServices row id
  client_id uuid not null references public.clients (id) on delete cascade,
  contract_id integer not null,
  contract_name text not null,
  contract_status text,
  service_id integer not null,
  service_name text not null,
  description text,
  last_synced_at timestamptz not null default now()
);

create index autotask_contract_services_client_idx on public.autotask_contract_services (client_id);

alter table public.autotask_contract_services enable row level security;
create policy "autotask_contract_services full access for authenticated" on public.autotask_contract_services
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
