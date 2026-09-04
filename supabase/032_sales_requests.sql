-- CG Technologies Client Tracker — Sales/Quote Request pipeline: tracks
-- one item/service a client or a tech has asked to be quoted, through
-- Requested -> Quoted -> Approved -> Ordered -> Delivered. Deliberately a
-- different concept from the old `quotes` table (dropped in
-- 004_ops_restructure.sql because "sales tracks quotes elsewhere, no
-- dollar amounts involved") — this is a stage tracker, not a pricing tool,
-- named distinctly so it's never confused with that dropped table.
create type public.sales_request_stage as enum
  ('requested', 'quoted', 'approved', 'ordered', 'delivered', 'cancelled');
create type public.sales_request_source as enum ('manual', 'mailbox_ai');

create table public.sales_requests (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: an internal/company order (new laptops, parts, etc.) isn't
  -- for any client — same convention as tasks.client_id ("No client
  -- (internal)").
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  detail text,
  stage public.sales_request_stage not null default 'requested',
  source public.sales_request_source not null default 'manual',
  requested_by_name text,
  requested_by_email text,
  assigned_to uuid references public.profiles (id) on delete set null,
  related_email_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_requests_stage_idx on public.sales_requests (stage, created_at desc);
create index sales_requests_client_idx on public.sales_requests (client_id);

create trigger sales_requests_set_updated_at before update on public.sales_requests
  for each row execute procedure public.set_updated_at();

alter table public.sales_requests enable row level security;
create policy "sales_requests full access for authenticated" on public.sales_requests
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
