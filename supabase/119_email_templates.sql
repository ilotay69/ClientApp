-- Editable subject/cover-note for client-facing emails (Quarterly Review,
-- Block of Hours Usage Report) — Settings -> Integrations -> Email
-- Templates. No seed rows: getEmailTemplate() falls back to a hardcoded
-- default per key until someone actually saves an edit, so this table
-- only ever holds overrides, not a full copy of every default.
create table public.email_templates (
  key text primary key,
  subject text not null,
  intro text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger email_templates_set_updated_at before update on public.email_templates
  for each row execute procedure public.set_updated_at();

alter table public.email_templates enable row level security;
-- Deliberately no policy for `authenticated` — same posture as
-- autotask_settings and every other integration-settings table; only
-- ever touched via the service-role admin client.
