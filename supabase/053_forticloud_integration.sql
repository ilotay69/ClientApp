-- Unlike every other integration's settings table, this is a REPEATABLE
-- list, not a singleton — confirmed with the user: FortiCloud is mostly a
-- handful of CG-owned shared accounts, but a few clients have their own
-- FortiCloud account. One row per account (shared or client-owned) covers
-- both: a shared account is simply one no client has an exclusive claim
-- on, while a client-dedicated account is one only that client links to
-- via clients.forticloud_account_id below.
create table public.forticloud_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  api_user text not null,
  api_password text not null,
  cached_access_token text,
  cached_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger forticloud_accounts_set_updated_at before update on public.forticloud_accounts
  for each row execute procedure public.set_updated_at();

alter table public.forticloud_accounts enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- every other integration's settings table.

-- Which FortiCloud account (shared or dedicated) a client uses, if any —
-- same role ninjaone_organization_id/autotask_company_id/m365_tenant_id
-- play for their own integrations, just referencing a local table instead
-- of an external id directly, since FortiCloud accounts are managed here
-- rather than looked up live.
alter table public.clients add column if not exists forticloud_account_id uuid references public.forticloud_accounts (id) on delete set null;
