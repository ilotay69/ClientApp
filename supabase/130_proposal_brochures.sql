-- ============================================================================
-- A reusable brochure library for Proposals — upload each PDF/image once,
-- then check which ones go out with any given proposal, rather than
-- re-uploading the same company brochure into every proposal that needs
-- it. Same "upload once, attach per record via a checkbox" shape as the
-- quarterly review's optional PDF sections, applied to a fixed file
-- instead of a generated one.
--
-- A checked brochure does two things at once: it's attached to the send
-- email, and it appears as a link on the prospect's own proposal page
-- (opens in a new tab). One checkbox, not two, to keep this simple — see
-- proposal-brochures.ts for where each half is implemented.
--
-- Run this in the Supabase SQL Editor AFTER 129.
-- ============================================================================

create table public.proposal_brochures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  file_size_bytes bigint,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index proposal_brochures_created_idx on public.proposal_brochures (created_at desc);

alter table public.proposal_brochures enable row level security;
create policy "proposal_brochures full access for staff" on public.proposal_brochures
  for all using (public.is_staff()) with check (public.is_staff());

-- Which brochures are checked for which proposal. A plain link table, not a
-- boolean column on proposal_brochures — a brochure can be attached to many
-- proposals, and a proposal can carry many brochures.
create table public.proposal_brochure_links (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  brochure_id uuid not null references public.proposal_brochures (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, brochure_id)
);

create index proposal_brochure_links_brochure_idx on public.proposal_brochure_links (brochure_id);

alter table public.proposal_brochure_links enable row level security;
create policy "proposal_brochure_links full access for staff" on public.proposal_brochure_links
  for all using (public.is_staff()) with check (public.is_staff());

-- Private bucket, same staff-only posture as quarterly-review-attachments
-- (103). The prospect-facing download route uses the service-role admin
-- client to mint signed URLs, which bypasses these policies entirely — they
-- exist for the staff-facing library page, not the public link.
insert into storage.buckets (id, name, public)
values ('proposal-brochures', 'proposal-brochures', false)
on conflict (id) do nothing;

create policy "proposal-brochures bucket readable by staff" on storage.objects
  for select using (bucket_id = 'proposal-brochures' and public.is_staff());
create policy "proposal-brochures bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'proposal-brochures' and public.is_staff());
create policy "proposal-brochures bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'proposal-brochures' and public.is_staff());
