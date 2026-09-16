-- One standalone PDF per optional "also include in PDF" section (Device
-- Health, 365 Licenses, ...) — generated the moment a tech checks that
-- section on the review page (generateQuarterlyReviewSectionPdf), kept
-- separate from the main review PDF so it can be previewed on its own and
-- attached alongside (not merged into) the review when it's sent. Reuses
-- the existing quarterly-review-pdfs storage bucket, at
-- "<review_id>/sections/<section_key>.pdf" — no new bucket needed.
create table public.quarterly_review_section_pdfs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.quarterly_reviews (id) on delete cascade,
  section_key text not null,
  storage_path text not null,
  generated_at timestamptz not null default now(),
  unique (review_id, section_key)
);

create index quarterly_review_section_pdfs_review_idx on public.quarterly_review_section_pdfs (review_id);

alter table public.quarterly_review_section_pdfs enable row level security;
create policy "quarterly_review_section_pdfs full access for staff" on public.quarterly_review_section_pdfs
  for all using (public.is_staff()) with check (public.is_staff());
