-- CG Technologies Client Tracker — task status rework + notes
-- Run this in the Supabase SQL Editor AFTER 005_task_enhancements.sql.
--
-- The Tasks tab workflow moves from a binary open/done/dismissed status to
-- an editable set of work-in-progress stages: open, in_progress, on_hold,
-- waiting_client. 'done' and 'dismissed' are left in the enum (Postgres
-- can't cheaply drop enum values, and any historical rows stay valid) but
-- the app no longer offers them in the status editor going forward — a
-- task is deleted rather than marked done/dismissed now.
--
-- Also adds a free-text `notes` field, separate from the existing `detail`
-- field shown under the task title.

alter type public.task_status add value if not exists 'on_hold';
alter type public.task_status add value if not exists 'waiting_client';

alter table public.tasks add column if not exists notes text;
