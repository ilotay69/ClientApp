-- Storage buckets and their policies, for provisioning a fresh project.
--
-- These are NOT part of a `pg_dump --schema=public` of production: a bucket
-- is a ROW in storage.buckets (data, not schema), and its policies live on
-- storage.objects, which is outside the public schema. So a schema restore
-- leaves a project that looks complete but cannot store a single file.
--
-- Transcribed from production on 2026-09-18 (6 buckets, 18 policies). Run
-- AFTER the public-schema restore, because every policy below calls
-- public.is_staff(), which migration 064 defines.
--
-- Every bucket is private. None of this app's stored files (client
-- documents, resumes, signed proposals, QBR PDFs) should ever be reachable
-- by an unauthenticated URL.

insert into storage.buckets (id, name, public)
values
  ('client-documents', 'client-documents', false),
  ('proposal-brochures', 'proposal-brochures', false),
  ('proposal-signatures', 'proposal-signatures', false),
  ('quarterly-review-attachments', 'quarterly-review-attachments', false),
  ('quarterly-review-pdfs', 'quarterly-review-pdfs', false),
  ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- client-documents
create policy "client-documents readable by authenticated" on storage.objects
  for select using (bucket_id = 'client-documents' and public.is_staff());
create policy "client-documents insertable by authenticated" on storage.objects
  for insert with check (bucket_id = 'client-documents' and public.is_staff());
create policy "client-documents deletable by authenticated" on storage.objects
  for delete using (bucket_id = 'client-documents' and public.is_staff());

-- proposal-brochures
create policy "proposal-brochures bucket readable by staff" on storage.objects
  for select using (bucket_id = 'proposal-brochures' and public.is_staff());
create policy "proposal-brochures bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'proposal-brochures' and public.is_staff());
create policy "proposal-brochures bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'proposal-brochures' and public.is_staff());

-- proposal-signatures
create policy "proposal-signatures bucket readable by staff" on storage.objects
  for select using (bucket_id = 'proposal-signatures' and public.is_staff());
create policy "proposal-signatures bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'proposal-signatures' and public.is_staff());
create policy "proposal-signatures bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'proposal-signatures' and public.is_staff());

-- quarterly-review-attachments
create policy "quarterly-review-attachments bucket readable by staff" on storage.objects
  for select using (bucket_id = 'quarterly-review-attachments' and public.is_staff());
create policy "quarterly-review-attachments bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'quarterly-review-attachments' and public.is_staff());
create policy "quarterly-review-attachments bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'quarterly-review-attachments' and public.is_staff());

-- quarterly-review-pdfs. The only bucket with an UPDATE policy and no
-- DELETE: quarterly-review-data.ts uploads these with upsert: true, so a
-- regenerated PDF overwrites rather than replaces its object.
create policy "quarterly-review-pdfs bucket readable by staff" on storage.objects
  for select using (bucket_id = 'quarterly-review-pdfs' and public.is_staff());
create policy "quarterly-review-pdfs bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'quarterly-review-pdfs' and public.is_staff());
create policy "quarterly-review-pdfs bucket updatable by staff" on storage.objects
  for update using (bucket_id = 'quarterly-review-pdfs' and public.is_staff());

-- resumes
create policy "resumes bucket readable by staff" on storage.objects
  for select using (bucket_id = 'resumes' and public.is_staff());
create policy "resumes bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'resumes' and public.is_staff());
create policy "resumes bucket deletable by staff" on storage.objects
  for delete using (bucket_id = 'resumes' and public.is_staff());
