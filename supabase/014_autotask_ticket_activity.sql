-- Both fields already come back on the existing Tickets/query call used to
-- sync the ticket list — free to store. lastActivityDate is the key signal
-- for "has this ticket gone quiet" (no note/status change/reply logged).
alter table public.autotask_tickets add column if not exists opened_at timestamptz;
alter table public.autotask_tickets add column if not exists last_activity_at timestamptz;
