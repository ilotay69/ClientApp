-- CG's own name/address, shown as the "from" side on client-facing
-- documents (currently just proposals: the public proposal page and its
-- signed-copy PDF) -- editable under Settings -> Integrations rather than
-- hardcoded, so it never needs a code change if the office moves.
create table public.company_info (
  id boolean primary key default true,
  constraint company_info_singleton check (id),
  company_name text not null default 'CG Technologies',
  address text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create trigger company_info_set_updated_at before update on public.company_info
  for each row execute procedure public.set_updated_at();
alter table public.company_info enable row level security;
-- No policy for authenticated -- service-role only, same posture as every
-- other settings table under Settings -> Integrations.

insert into public.company_info (id, company_name) values (true, 'CG Technologies');
