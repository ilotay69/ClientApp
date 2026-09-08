-- ============================================================================
-- mail_connections: per-user list of dismissed appointment "types" (exact
-- normalized subject text) — an appointment whose subject matches one of
-- these is hidden from Upcoming Appointments going forward, until cleared.
-- ============================================================================
alter table public.mail_connections
  add column dismissed_appointment_subjects text[] not null default '{}';
