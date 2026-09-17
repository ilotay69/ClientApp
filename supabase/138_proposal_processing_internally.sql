-- Lets staff flag an accepted proposal as being worked on internally
-- (onboarding/fulfillment kicked off) without changing its actual
-- lifecycle status — accepted stays accepted; this is a separate,
-- staff-only tracking flag that surfaces as its own tab on the
-- Proposals list, split out of the plain "Accepted" bucket.
alter table public.proposals add column if not exists processing_internally boolean not null default false;
