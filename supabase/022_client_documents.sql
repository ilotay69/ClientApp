-- CG Technologies Client Tracker — client document uploads (signed quotes,
-- quarterly reviews). Extends the existing Timeline (client_interactions)
-- rather than a separate "Documents" list — an uploaded PDF becomes a
-- timeline entry like a logged note, with the file attached and its text
-- extracted into `body` so it reads and searches the same way a manually
-- typed note does.
--
-- Run this in the Supabase SQL Editor AFTER 021_m365_per_client_credentials.sql.

-- New value can't be used in the same script that adds it (Postgres 55P04),
-- so this migration only adds the values — the first upload that uses them
-- happens later, from the app.
alter type public.client_interaction_type add value if not exists 'quote';
alter type public.client_interaction_type add value if not exists 'review';

alter table public.client_interactions
  add column if not exists attachment_path text,
  add column if not exists attachment_filename text;

-- ============================================================================
-- Storage bucket for the actual PDF files. Private — signed quotes and
-- review documents are client-sensitive, so files are only ever served
-- through a signed URL minted by /api/documents/[id], never a public link.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

-- Matches this schema's "full access for authenticated" convention for
-- ordinary business data (see client_interactions itself) — every signed-in
-- user can upload/view documents, same as logging any other timeline entry.
create policy "client-documents readable by authenticated"
  on storage.objects for select
  using (bucket_id = 'client-documents' and auth.role() = 'authenticated');

create policy "client-documents insertable by authenticated"
  on storage.objects for insert
  with check (bucket_id = 'client-documents' and auth.role() = 'authenticated');

create policy "client-documents deletable by authenticated"
  on storage.objects for delete
  using (bucket_id = 'client-documents' and auth.role() = 'authenticated');
