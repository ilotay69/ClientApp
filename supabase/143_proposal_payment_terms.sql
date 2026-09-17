-- Editable payment-terms note shown under Pricing (staff editor), the
-- public proposal page, the PDF, and the acceptance email. Null means "use
-- the standard default line" -- see DEFAULT_PAYMENT_TERMS in
-- src/lib/proposal-totals.ts, which every one of those render sites falls
-- back to.
alter table public.proposals add column if not exists payment_terms text;
