-- ============================================================================
-- Resume Screener — job postings, imported resumes, one new mailbox setting,
-- and a dedicated Storage bucket for the PDFs.
--
-- Run this in the Supabase SQL Editor AFTER 067.
--
-- RLS here is the same "any staff member" backstop every table has used
-- since 065 (public.is_staff()) — the finer manage_recruitment permission
-- gate lives in the app layer (server actions), the same layered model
-- manage_integrations already uses for ai_provider_settings.
-- ============================================================================


-- ============================================================================
-- job_postings — append-only. There is deliberately no "active" flag: the
-- current posting is simply `order by created_at desc limit 1`. Editing the
-- posting means inserting a NEW row (see the server action), which is what
-- lets resumes.job_posting_id keep pointing at whatever posting a resume was
-- actually screened against even after the text changes later.
-- ============================================================================
create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index job_postings_created_at_idx on public.job_postings (created_at desc);

alter table public.job_postings enable row level security;
create policy "job_postings full access for staff" on public.job_postings
  for all using (public.is_staff()) with check (public.is_staff());


-- ============================================================================
-- resumes — one row per (Graph message, Graph attachment) pair pulled from a
-- staff member's watched mailbox folder. Inserted by the sync step with
-- job_posting_id/screened_at null; the screening step fills those in later,
-- once, per row. screened_at staying null is what "pending" means.
-- ============================================================================
create type public.resume_verdict as enum ('yes', 'maybe', 'no');
create type public.resume_status as enum ('new', 'reviewing', 'contacted', 'rejected', 'hired');

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  connection_user_id uuid references public.profiles (id) on delete set null,
  graph_message_id text not null,
  graph_attachment_id text not null,
  received_at timestamptz not null,
  sender_name text,
  sender_email text,
  subject text,
  file_name text not null,
  storage_path text not null,
  file_size_bytes integer,
  job_posting_id uuid references public.job_postings (id) on delete set null,
  candidate_name text,
  candidate_email text,
  candidate_phone text,
  ai_verdict public.resume_verdict,
  ai_comment text,
  screened_at timestamptz,
  screening_error text,
  status public.resume_status not null default 'new',
  imported_at timestamptz not null default now(),
  -- Dedup key: a message can carry more than one PDF, and a re-scan of the
  -- same lookback window must never create duplicate rows.
  unique (graph_message_id, graph_attachment_id)
);

create index resumes_received_at_idx on public.resumes (received_at desc);
create index resumes_status_idx on public.resumes (status, received_at desc);
create index resumes_pending_idx on public.resumes (screened_at) where screened_at is null;

alter table public.resumes enable row level security;
create policy "resumes full access for staff" on public.resumes
  for all using (public.is_staff()) with check (public.is_staff());


-- ============================================================================
-- mail_connections — which folder to watch, plus a display-only "last
-- synced" timestamp for this feature specifically. Separate from
-- last_synced_at (the older quote/project category sync) and
-- snapshot_synced_at (the mailbox-review snapshot) — three different
-- features, three different checkpoints, none of them should share a column.
-- ============================================================================
alter table public.mail_connections
  add column if not exists resume_folder_name text,
  add column if not exists resume_sync_last_synced_at timestamptz;


-- ============================================================================
-- Storage bucket — dedicated `resumes` bucket, NOT client-documents.
-- Candidate PII (a resume) is a different sensitivity/retention category
-- than client business documents (signed quotes, QBRs) — a future
-- "delete rejected candidates' resumes after N months" policy needs its own
-- bucket to apply cleanly, which mixing the two would make impossible to
-- reason about later.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes bucket readable by staff" on storage.objects
  for select using (bucket_id = 'resumes' and public.is_staff());
create policy "resumes bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'resumes' and public.is_staff());
create policy "resumes bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'resumes' and public.is_staff());
