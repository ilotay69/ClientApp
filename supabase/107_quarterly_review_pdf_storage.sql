-- ============================================================================
-- Persists the PDF that gets emailed to the client (previously generated
-- in-memory and thrown away right after sending) so a sent review can be
-- opened/downloaded again later — from the client's own record (normal
-- staff, not just manage_quarterly_reviews holders) and from their own
-- portal login.
--
-- Same private-bucket pattern as 103 (quarterly-review-attachments). The
-- app itself always reads this bucket through the service-role client
-- (see /api/quarterly-review-pdf/[id]/route.ts) and does its own
-- staff-or-this-client authorization check in code — same reasoning as
-- every portal data read in this app (a role='client' login has no useful
-- direct table/storage access under RLS at all) — so the staff-only
-- storage policies below are a defensive backstop, not the real boundary.
--
-- Run this in the Supabase SQL Editor AFTER 106.
-- ============================================================================

alter table public.quarterly_reviews
  add column if not exists pdf_storage_path text;

insert into storage.buckets (id, name, public)
values ('quarterly-review-pdfs', 'quarterly-review-pdfs', false)
on conflict (id) do nothing;

create policy "quarterly-review-pdfs bucket readable by staff" on storage.objects
  for select using (bucket_id = 'quarterly-review-pdfs' and public.is_staff());
create policy "quarterly-review-pdfs bucket insertable by staff" on storage.objects
  for insert with check (bucket_id = 'quarterly-review-pdfs' and public.is_staff());
create policy "quarterly-review-pdfs bucket updatable by staff" on storage.objects
  for update using (bucket_id = 'quarterly-review-pdfs' and public.is_staff());

-- New portal page: a client login can see their own sent reviews. Seeded
-- enabled for every existing sub-role, same as every other page was when
-- it was introduced (081) — narrow it later from Team -> Client access ->
-- Client portal roles if desired.
insert into public.client_portal_permissions (client_role, portal_page, enabled)
select r.role, 'reviews', true
from unnest(enum_range(null::public.client_portal_role)) as r(role)
on conflict (client_role, portal_page) do nothing;
