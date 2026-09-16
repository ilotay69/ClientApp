-- Which checklist a quarterly review was built from — "standard" (the
-- original checklist) or "avd" (mirrors "(company) AVD Quarterly System
-- Review (Month Year).docx", for clients on Azure Virtual Desktop with no
-- on-prem servers/workstations/network devices of their own). Picked once
-- when the review is started and fixed for its whole life, same posture as
-- ticket_number/hours_spent. Defaulted for every existing row so old
-- reviews keep rendering their original (Standard) checklist.
alter table public.quarterly_reviews add column if not exists template text not null default 'standard';
alter table public.quarterly_reviews add constraint quarterly_reviews_template_check check (template in ('standard', 'avd'));
