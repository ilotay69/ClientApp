-- ============================================================================
-- Screenshots/supporting images for a quarterly review — the appendix
-- section the original Word/PDF template ends with (server resource
-- graphs, VM lists, backup dashboards, etc.). One row per image, not a
-- column on quarterly_reviews, since a review can carry many.
--
-- Run this in the Supabase SQL Editor AFTER 102.
-- ============================================================================

create table public.quarterly_review_attachments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.quarterly_reviews (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size_bytes bigint,
  content_type text,
  -- Free-text caption, matching how the sample groups screenshots by
  -- device/section name ("MAX-FILE", "NAS Datto Backup", "Speed Test").
  label text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index quarterly_review_attachments_review_idx on public.quarterly_review_attachments (review_id, created_at);

alter table public.quarterly_review_attachments enable row level security;
create policy "quarterly_review_attachments full access for staff" on public.quarterly_review_attachments
  for all using (public.is_staff()) with check (public.is_staff());

-- Private bucket, same staff-only posture as the resumes bucket.
insert into storage.buckets (id, name, public)
values ('quarterly-review-attachments', 'quarterly-review-attachments', false)
on conflict (id) do nothing;

create policy "quarterly-review-attachments bucket readable by staff" on storage.objects
  for select using (bucket_id = 'quarterly-review-attachments' and public.is_staff());
create policy "quarterly-review-attachments bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'quarterly-review-attachments' and public.is_staff());
create policy "quarterly-review-attachments bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'quarterly-review-attachments' and public.is_staff());
