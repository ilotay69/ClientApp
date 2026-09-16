-- Which optional data sections get inserted into a review's PDF, beyond
-- the fixed checklist — starts with two (device_health, m365_licenses),
-- more to follow as a real checklist is worked out (see
-- QUARTERLY_REVIEW_EXTRA_SECTIONS in quarterly-review-sections.ts, the
-- single source of truth for valid keys — deliberately not a DB check
-- constraint, since that list is expected to grow). Defaulted to empty so
-- no existing review suddenly grows a new PDF section it never asked for.
alter table public.quarterly_reviews add column if not exists pdf_extra_sections text[] not null default '{}';
