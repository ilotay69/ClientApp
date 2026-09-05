-- Touchpoints become a running relationship-contact log instead of a
-- scheduled-visit-cadence tracker: the old type (monthly_visit /
-- quarterly_review) is replaced by how the client was actually
-- contacted, and notes is renamed to outcome to match. due_date keeps
-- its name (still just "when's the next touchpoint due") even though the
-- app now presents it as "next contact date".
create type public.touchpoint_contact_method as enum ('email', 'call', 'meeting');

alter table public.touchpoints add column contact_method public.touchpoint_contact_method;
alter table public.touchpoints rename column notes to outcome;
alter table public.touchpoints drop column type;

drop type if exists public.touchpoint_type;
