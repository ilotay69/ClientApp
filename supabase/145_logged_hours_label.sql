-- Adds a Regular / After Hours / Taken Off label to each logged-hours entry
-- (144). Taken Off subtracts from the running total instead of adding to
-- it - computed at read time (signedHours in src/lib/logged-hours.ts) from
-- the stored positive value, never stored as a negative number here, so
-- the entered figure always matches what someone actually typed.
alter table public.logged_hours add column if not exists label text not null default 'regular'
  check (label in ('regular', 'after_hours', 'taken_off'));

-- One entry per label per day now, not just one per day - a half day
-- worked plus a half day taken off on the same date needs two rows.
alter table public.logged_hours drop constraint if exists logged_hours_user_id_work_date_key;
alter table public.logged_hours
  add constraint logged_hours_user_id_work_date_label_key unique (user_id, work_date, label);
