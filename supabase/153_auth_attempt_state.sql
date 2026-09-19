-- ============================================================================
-- auth_attempt_state — recent failure counts for one subject and one IP, in a
-- single round trip, for the progressive-delay curve in src/lib/auth-attempts.ts.
--
-- Failures only (succeeded = false) and only within the trailing window. A
-- successful sign-in does not reset the counter by deleting rows — the delay
-- curve simply stops counting a window that contains recent failures once
-- they age out. Keeping the successes in the table is what lets "40 failures
-- then a success" be reconstructed later.
--
-- Returns two counts rather than one so the caller can treat subject and IP
-- with different thresholds: three failures for one email across three IPs is
-- an attack; three failures from one office IP is a fat finger.
--
-- Runs as the service-role client, which bypasses RLS, so no SECURITY DEFINER
-- and no extra grants — same trust boundary as every other server-only read.
--
-- Run this in the Supabase SQL Editor. Depends on 152 (auth_attempts).
-- ============================================================================

create or replace function public.auth_attempt_state(
  p_surface text,
  p_subject_hash text,
  p_ip_hash text,
  p_window_minutes int
)
returns table (subject_failures int, ip_failures int)
language sql
stable
as $$
  select
    coalesce(count(*) filter (
      where p_subject_hash is not null
        and subject_hash = p_subject_hash
    ), 0)::int as subject_failures,
    coalesce(count(*) filter (
      where p_ip_hash is not null
        and ip_hash = p_ip_hash
    ), 0)::int as ip_failures
  from public.auth_attempts
  where surface = p_surface
    and succeeded = false
    and created_at > now() - make_interval(mins => p_window_minutes);
$$;
