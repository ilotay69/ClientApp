-- Synced from Autotask's Company record alongside primary_contact_name/
-- primary_contact_email (see syncClientAutotaskData) -- lets the New
-- Proposal form prefill Contact name/email/Address instantly from
-- already-synced data instead of a live Autotask call on every client
-- pick.
alter table public.clients add column if not exists address text;
