-- ============================================================================
-- mail_connections: drop review_subfolder — the mailbox review now scans
-- the whole mailbox in one call (excluding a fixed set of system folders)
-- instead of a small set of named folders, so a single "extra folder to
-- watch" preference no longer applies.
-- ============================================================================
alter table public.mail_connections
  drop column review_subfolder;
