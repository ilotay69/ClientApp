-- ============================================================================
-- auth_attempts — one row per authentication attempt, successful or not.
--
-- This app has no rate limiting, throttling, attempt counting or lockout of
-- any kind. The only thing between a password list and a portal login is
-- Supabase's own /auth/v1/token limit of 1800 requests per hour PER IP, which
-- has no per-account component at all.
--
-- This migration is step one of fixing that, and step one deliberately does
-- NOT block anything. Nothing reads this table yet. It records, for a week or
-- two, so the thresholds we then set are measured against this team's real
-- failure rate rather than guessed. A delay curve tuned to an invented
-- baseline either does nothing or locks out the people it was built for.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

create table public.auth_attempts (
  -- bigint identity, not uuid: this table is append-heavy, nothing ever
  -- references a row, and a monotonic key keeps the indexes below compact.
  id bigint generated always as identity primary key,

  -- password_signin | mfa_verify | passkey_signin | proposal_view |
  -- proposal_accept | review_ack | brochure. Text rather than an enum so a
  -- new surface does not need a migration and an enum-transaction split.
  surface text not null,

  -- Salted SHA-256 of whatever identifies the target: the submitted email
  -- (lowercased), a user id, or a token. NEVER the raw value.
  --
  -- Storing the email in the clear would turn this table into a list of
  -- every address anyone has ever tried to sign in as — a credential
  -- stuffing list someone else compiled, sitting in our database, growing
  -- fastest during an attack. Hashing changes no counting behaviour, because
  -- counting only ever compares a hash to a hash.
  --
  -- The salt lives in AUTH_ATTEMPT_SALT, server-side only. A fast hash over
  -- the small space of plausible emails or the whole IPv4 space is
  -- brute-forceable by anyone holding both this table and that variable, so
  -- the salt's secrecy is the actual control here, not the hash.
  subject_hash text,

  -- Salted the same way, with the same salt. Nullable: a request whose
  -- client address can't be established is still worth counting by subject.
  ip_hash text,

  -- Recorded for successes too, so a counter can be reset on a good login
  -- and so "forty failures then a success" is answerable later.
  succeeded boolean not null default false,

  created_at timestamptz not null default now()
);

-- Partial, because every lookup is "recent failures for this subject" or
-- "...for this ip", and a null key is never queried.
create index auth_attempts_subject_idx
  on public.auth_attempts (surface, subject_hash, created_at desc)
  where subject_hash is not null;

create index auth_attempts_ip_idx
  on public.auth_attempts (surface, ip_hash, created_at desc)
  where ip_hash is not null;

-- For the retention delete, which scans by age alone.
create index auth_attempts_created_idx on public.auth_attempts (created_at);

alter table public.auth_attempts enable row level security;

-- Deliberately NO policies. Written and read only through the service-role
-- client from server code, same stance migration 065 takes for the tables a
-- portal login must never reach directly. A client-visible attempt log would
-- tell an attacker exactly how close they are to a threshold.
--
-- RLS with zero policies denies everything to anon and authenticated even
-- though both hold table grants by default, so no grant changes are needed
-- here — unlike mail_connections in 151, where a policy DID exist and the
-- grants were what leaked.

-- Retention. Nothing here is useful after a month, and an unbounded table
-- makes the `created_at > now() - interval` scans slowest exactly when the
-- table is growing fastest, which is during an attack.
--
-- No pg_cron dependency: nothing in this project uses pg_cron today, whereas
-- the X-Cron-Secret + Railway cron-service pattern is already deployed
-- eleven times over. The cleanup will hang off that.
--
--   delete from public.auth_attempts where created_at < now() - interval '30 days';
