-- Per-user Dashboard widget selection (Settings -> Dashboard). No row for a
-- user means "show every widget they have permission to see" (an opt-out
-- model, not opt-in) — so a first-time visit is never a blank/empty
-- dashboard; enabled_widgets only narrows things down once someone actually
-- visits the preferences page and unchecks something.
create table public.dashboard_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled_widgets text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger dashboard_preferences_set_updated_at before update on public.dashboard_preferences
  for each row execute procedure public.set_updated_at();

alter table public.dashboard_preferences enable row level security;
create policy "dashboard_preferences read own" on public.dashboard_preferences
  for select using (auth.uid() = user_id);
create policy "dashboard_preferences write own" on public.dashboard_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
