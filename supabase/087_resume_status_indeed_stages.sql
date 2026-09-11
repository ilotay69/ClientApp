-- ============================================================================
-- Expands resume_status from 2 values (new/reviewed) to 6, matching
-- Indeed's own applicant status stages exactly: new, reviewing, contacting,
-- interviewing, rejected, hired. Postgres has no ALTER TYPE ... DROP/RENAME
-- VALUE in a way that lets us cleanly relabel here, so this rebuilds the
-- enum the same way 074 did: widen to text, remap existing data, drop and
-- recreate the type, narrow the column back.
--
-- Every existing "reviewed" row is folded into "reviewing" — the more
-- granular original status (reviewing/contacting/rejected/hired) was
-- already lost when 074 collapsed everything down to "reviewed", so there's
-- no way to recover which specific stage each row was actually in.
--
-- Run this in the Supabase SQL Editor AFTER 086.
-- ============================================================================

alter table public.resumes alter column status drop default;
alter table public.resumes alter column status type text using status::text;

update public.resumes set status = 'reviewing' where status = 'reviewed';

drop type public.resume_status;
create type public.resume_status as enum ('new', 'reviewing', 'contacting', 'interviewing', 'rejected', 'hired');

alter table public.resumes
  alter column status type public.resume_status using status::public.resume_status,
  alter column status set default 'new',
  alter column status set not null;
