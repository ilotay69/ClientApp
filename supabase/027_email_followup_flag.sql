-- CG Technologies Client Tracker — email_links gains follow-up flag support.
-- Mail sync now also captures messages currently flagged for follow-up in
-- Outlook (regardless of Quote/Project category), matched against ANY of a
-- client's saved contacts (not just their primary contact), from Inbox or
-- Sent Items. A message with no category is stored as type 'followup'; one
-- that also carries Quote/Project keeps that type, with is_flagged marking
-- it as also needing follow-up. Once captured, a row is permanent — if the
-- flag is later cleared in Outlook, it stays in the client's Timeline as a
-- historical record rather than disappearing.
alter type public.email_link_type add value if not exists 'followup';
alter table public.email_links add column if not exists is_flagged boolean not null default false;
