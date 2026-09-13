-- ============================================================================
-- Lets the daily reminder digest (/api/reminders) log an "alert" entry the
-- same way it already logs touchpoint/project/task/service_check ones —
-- needed so the cron's per-day dedup (see reminder_log's use in that
-- route) also covers unacknowledged alerts once they're folded into the
-- digest. New enum value only — nothing in this migration uses it yet, so
-- it's safe to run on its own (Postgres won't let a new enum value be used
-- in the same transaction that added it, but this file doesn't try to).
--
-- Run this in the Supabase SQL Editor AFTER 108.
-- ============================================================================

alter type public.reminder_kind add value if not exists 'alert';
