-- CG Technologies Client Tracker — reverting the persisted time entries
-- table from 025_autotask_time_entries.sql.
--
-- Decision: pattern analysis runs entirely on-demand — a live 90-day
-- fetch from Autotask, analyzed in memory, nothing stored. Nothing else
-- in this app reads from this table, so dropping it is a clean revert.
--
-- Run this in the Supabase SQL Editor AFTER 025_autotask_time_entries.sql.

drop table if exists public.autotask_time_entries;
