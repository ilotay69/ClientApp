-- Both columns already come back on the existing Tickets/query call used
-- to sync the ticket list — free to store alongside everything else.
alter table public.autotask_tickets add column if not exists description text;
alter table public.autotask_tickets add column if not exists resolution text;
