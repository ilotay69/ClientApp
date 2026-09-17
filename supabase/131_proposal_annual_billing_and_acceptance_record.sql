-- ============================================================================
-- Two additions to Proposals:
--
-- 1. A third billing period, 'annual' — line items were only ever one-off
--    or monthly; an annual licence or support fee had to be forced into
--    one-off with a note explaining it wasn't really. Own ALTER TYPE
--    statement, per the usual Postgres 55P04 rule (a new enum value can't
--    be used in the same transaction that adds it) — nothing later in
--    this file writes a row using 'annual', so it's safe to combine with
--    part 2 below in one migration.
--
-- 2. A permanent acceptance record on proposals — the answer to "is it
--    safe if someone accepts it and the client later denies it". A
--    self-asserted name/email was already captured, but nothing pinned
--    down WHAT was agreed to (if line items are ever touched after
--    acceptance) or the circumstances of the click itself. These columns
--    are written once, at the moment of acceptance
--    (acceptProposalByTokenAction / markProposalAcceptedByStaffAction),
--    and never afterward:
--      - accepted_total_amount / accepted_tax_amount / accepted_tax_rate:
--        the exact numbers shown to whoever clicked Accept, independent of
--        anything the line items do later.
--      - accepted_ip_hash / accepted_user_agent: the same salted-hash
--        posture as proposal_views.ip_hash — enough to answer "was this
--        opened from a browser at all, and does that match other activity
--        on the account", never the raw address.
--      - accept_authority_confirmed: whether the person checked "I have
--        authority to accept this on behalf of {company}" before
--        submitting. This is not identity verification — nobody is
--        cryptographically signing anything — but a recorded, affirmative
--        statement of authority is the standard a court or an internal
--        dispute actually looks for in a click-to-accept flow, and its
--        absence is the difference between "they clicked a button" and
--        "they clicked a button after being told what that meant".
--
-- Run this in the Supabase SQL Editor AFTER 130.
-- ============================================================================

alter type public.proposal_billing_period add value if not exists 'annual';

alter table public.proposals
  add column if not exists accepted_total_amount numeric(12,2),
  add column if not exists accepted_tax_amount numeric(12,2),
  add column if not exists accepted_tax_rate numeric(5,4),
  add column if not exists accepted_ip_hash text,
  add column if not exists accepted_user_agent text,
  add column if not exists accept_authority_confirmed boolean not null default false;
