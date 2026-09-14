-- Quarterly review reminders: recurring "please acknowledge" emails to the
-- client until they acknowledge, a configurable approver + reminder cadence
-- under Settings -> Integrations, and a manual "client acknowledged" record
-- for when the client replies by email instead of clicking the link.

create table public.quarterly_review_reminder_settings (
  id boolean primary key default true,
  constraint quarterly_review_reminder_settings_singleton check (id),
  approver_email text not null default 'ilotay@cgtechnologies.com',
  reminder_interval_days integer not null default 7,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger quarterly_review_reminder_settings_set_updated_at before update on public.quarterly_review_reminder_settings
  for each row execute procedure public.set_updated_at();
alter table public.quarterly_review_reminder_settings enable row level security;
-- No policy for authenticated — service-role only, same posture as every
-- other integration-settings table under Settings -> Integrations.

insert into public.quarterly_review_reminder_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.quarterly_reviews
  add column reminder_count integer not null default 0,
  add column last_reminder_at timestamptz,
  -- Set only when the approver manually records that the client
  -- acknowledged (e.g. by replying to the email rather than clicking the
  -- link) — null when the client acknowledged themselves via the public
  -- ack page. Distinguishes the two in the UI.
  add column client_ack_confirmed_by uuid references public.profiles (id) on delete set null;
