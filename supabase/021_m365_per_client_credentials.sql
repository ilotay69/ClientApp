-- Replaces the GDAP/OBO design (a single shared refresh token, exchanged
-- per customer tenant) with per-client app-registration credentials —
-- GDAP's cross-tenant token exchange hit an unresolvable Conditional
-- Access/MFA wall for tenants that require MFA for Graph access, since a
-- non-interactive background sync can never satisfy an interactive MFA
-- challenge. App-only (client-credentials) auth sidesteps that entirely.
drop table if exists public.m365_partner_settings;

create table public.m365_client_credentials (
  client_id uuid primary key references public.clients (id) on delete cascade,
  app_client_id text not null,
  app_client_secret text not null,
  cached_access_token text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger m365_client_credentials_set_updated_at before update on public.m365_client_credentials
  for each row execute procedure public.set_updated_at();

alter table public.m365_client_credentials enable row level security;
-- No policy for `authenticated` — service-role only, same posture as
-- autotask_settings/ninjaone_settings. clients.m365_tenant_id (added in
-- 019) stays as-is — it's the tenant id, not a secret.
