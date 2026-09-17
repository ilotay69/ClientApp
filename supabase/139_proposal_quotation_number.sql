-- The client-facing reference shown everywhere instead of the plain
-- internal #14 sequence (proposal_number, kept as-is for nothing beyond
-- internal bookkeeping) -- initials from the client/prospect company
-- name's first two words, plus the date and time it was created, e.g.
-- "BS-20260917-1432". Assigned once at creation (createProposalAction)
-- and never regenerated. Nullable rather than backfilled: existing
-- proposals created before this migration keep showing "#14" until
-- resent/recreated, rather than a data migration inventing a quotation
-- number that was never actually assigned at creation time for them.
alter table public.proposals add column if not exists quotation_number text;
