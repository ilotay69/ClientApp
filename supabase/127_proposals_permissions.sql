-- ============================================================================
-- Permission keys for the Proposals feature: build a proposal, send it to a
-- prospect as a tokenised link, and record their acceptance.
--
-- Split view_/manage_ the same way sales requests and clients already are —
-- a manager who should see the pipeline and its "opened 4 times, still not
-- accepted" signal doesn't necessarily need to edit or send anything.
--
-- Deleting a proposal stays under manage_proposals (the sales_requests
-- posture), not its own key like delete_quarterly_reviews — a draft
-- proposal isn't an approval artifact, so there's nothing to protect from
-- the person who can already rewrite it.
--
-- Run this in the Supabase SQL Editor AFTER 126. The role_permissions seed
-- is the NEXT migration: a value added by ALTER TYPE ... ADD VALUE can't be
-- used in the same transaction that added it (Postgres 55P04).
-- ============================================================================
alter type public.permission_key add value if not exists 'view_proposals';
alter type public.permission_key add value if not exists 'manage_proposals';
