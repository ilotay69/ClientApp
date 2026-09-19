-- Independent of the classic dashboard's enabled_widgets preference.
-- Additive: each staff member owns their new dashboard layout and view choice.
create table if not exists public.dashboard_workspaces (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_workspace_object check (jsonb_typeof(config) = 'object'),
  constraint dashboard_workspace_size check (octet_length(config::text) <= 65536)
);
alter table public.dashboard_workspaces enable row level security;
grant select, insert, update, delete on public.dashboard_workspaces to authenticated;
create policy "dashboard_workspaces own rows" on public.dashboard_workspaces
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger dashboard_workspaces_set_updated_at before update on public.dashboard_workspaces
  for each row execute procedure public.set_updated_at();
