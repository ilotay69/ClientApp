-- CG Technologies Client Tracker — Sales Requests (Internal Sales) gains a
-- back-and-forth notes thread, and a place to configure who gets notified
-- (the internal sales rep) when a request is created, changed, or noted.
create table public.sales_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sales_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index sales_request_notes_request_idx on public.sales_request_notes (request_id, created_at);
alter table public.sales_request_notes enable row level security;
create policy "sales_request_notes full access for authenticated" on public.sales_request_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table public.sales_notification_settings (
  id boolean primary key default true,
  constraint sales_notification_settings_singleton check (id),
  rep_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger sales_notification_settings_set_updated_at before update on public.sales_notification_settings
  for each row execute procedure public.set_updated_at();
alter table public.sales_notification_settings enable row level security;
-- No policy for authenticated — service-role only, same posture as the
-- other integration-settings tables, even though an email address isn't
-- itself a secret; keeps this consistent with everything else under
-- Settings -> Integrations.
