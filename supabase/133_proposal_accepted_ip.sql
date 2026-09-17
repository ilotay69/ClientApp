-- ============================================================================
-- Stores the real IP address at the moment of acceptance, not just its
-- salted hash.
--
-- proposal_views.ip_hash stays hashed on purpose — a page view is a low-
-- stakes, repeated event, and the hash only ever needs to answer "is this
-- the same reader as before", never "who was this". Acceptance is a
-- different kind of event: it's the record a dispute would actually turn
-- on, and a hash that can't be read back is useless for that — the same
-- reasoning DocuSign and similar tools use when they print the signer's
-- real IP on a certificate of completion. accepted_ip_hash (131) is left
-- in place rather than dropped, but nothing writes to it going forward;
-- acceptProposalByTokenAction now writes the raw address here instead.
--
-- Run this in the Supabase SQL Editor AFTER 132.
-- ============================================================================

alter table public.proposals
  add column if not exists accepted_ip text;
