# Security probe harness

Sends deliberately abusive traffic at the app's unauthenticated surfaces and
asserts it stays generic and up. **Staging only.** Pointed at production this
is an outage and a credential-stuffing tool — it is one by design (see the
plan), so the guards that keep it off production are security code and changes
to `lib/guard.mjs` deserve a security review.

## Run

```bash
npm run security-probe -- \
  --target=https://staging.ops.cgtechnologies.com \
  --i-understand-this-generates-load
```

Four independent locks must all pass or it refuses (`lib/guard.mjs`):
1. `--target` is mandatory — no default.
2. The host is not a known production host, by literal string.
3. The host contains `staging`.
4. The deployment renders `data-env-banner="true"` (set only when
   `NEXT_PUBLIC_ENV_LABEL` is present; production leaves it unset). This asks
   the running server what it is — the one lock a DNS mistake can't fool.

Plus `--i-understand-this-generates-load`.

Flags: `--count=N` (default 20, capped 200), `--only=fuzz-fields,token-guess`.

Exit non-zero on any `high` or `error` finding, so it can gate CI.

## Counts stay low on purpose

Supabase's auth rate limits are **per project**. A heavy run locks out anyone
else testing staging for the rest of the hour. 20 is plenty to characterise;
raise it only when you specifically need to.

## Probes

- **fuzz-fields** — oversized/malformed input (1MB strings, null bytes, CRLF,
  path traversal, RTL override, SQL metachars) at the token routes and the
  export API. Asserts: never a 500, never a stack trace, never a raw Postgres
  or framework error. Fully automated, real assertions today.
- **token-guess** — random UUIDs at the proposal, review-ack and brochure
  routes. Asserts: no internals leaked, and equal-length unknown tokens give
  equal-sized responses (no existence oracle). Fully automated.
  *Honest scope:* the tokens are 122-bit v4 UUIDs; guessing one is not a real
  threat. This tests the **oracle and the response shape**, not entropy.
- **password-rate** — hits Supabase's `/auth/v1/token` directly (the real
  attacker's path, which bypasses our form-level throttle entirely) to
  characterise the baseline and the enumeration gap between a real and a
  nonexistent account. **Asserts nothing yet** — it prints the before-picture.
  Needs `PROBE_SUPABASE_URL`, `PROBE_SUPABASE_ANON_KEY`, `PROBE_EMAIL` in env;
  skips cleanly without them.
- **mfa-rate** — **not automated.** The verify path is a Server Action needing
  a real AAL1 session. Two checks to do by hand on staging, verified by
  querying `auth_attempts` through the staging MCP:
  1. one wrong code → exactly one `auth_attempts` row (the auto-submit-loop
     guard);
  2. repeated wrong codes throttled under Supabase's 15/min, and a correct
     code still works immediately after (throttled, not locked out).

## What it deliberately cannot do

It never signs in through the form or reads the database. Credentials come
from env only, never flags (shell history) and never the repo. It cannot test
the app-level throttle on the password form until that throttle exists and is
invoked through the Server Action — a later step.

Report JSON is written to the OS temp dir; the path is printed. Never into the
repo.
