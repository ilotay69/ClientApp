-- ============================================================================
-- mail_connections: per-user mailbox review preferences — remembered across
-- visits so a user doesn't have to re-type their subfolder/exclude list
-- every time. One row per user already exists (user_id is the primary
-- key), so these are just new nullable columns on it, not a new table.
-- ============================================================================
alter table public.mail_connections
  add column review_subfolder text,
  add column review_excludes text,
  add column review_lookback_days integer;
