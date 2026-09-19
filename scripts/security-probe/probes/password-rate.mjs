import { timedFetch, median, percentile, sleep } from "../lib/http.mjs";

/**
 * Credential-stuffing characterisation.
 *
 * Important honesty about scope: our app-level attempt recording and (later)
 * throttling live in the `signIn` Server Action, i.e. the FORM path. A real
 * attacker skips the form and hits Supabase's /auth/v1/token directly with
 * the public anon key. This probe hits that direct endpoint, because that is
 * the true attack surface and the honest baseline — and it means the real
 * defence for this path is Supabase's own rate limits plus CAPTCHA (which,
 * once enabled, applies at the GoTrue level and so covers the direct
 * endpoint too), NOT our attempt table alone. That distinction goes in the
 * report.
 *
 * Until throttling/CAPTCHA ships this probe ASSERTS NOTHING — it measures and
 * prints, so the numbers here are the before-picture. The key assertion it is
 * built for is the enumeration check: a real account and a nonexistent one at
 * the same domain must be indistinguishable by timing and status.
 *
 * Needs, from env (skips cleanly if absent):
 *   PROBE_SUPABASE_URL, PROBE_SUPABASE_ANON_KEY  — the staging project
 *   PROBE_EMAIL                                  — a real staging account
 */
export async function run(origin, opts) {
  const url = process.env.PROBE_SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.PROBE_SUPABASE_ANON_KEY;
  const realEmail = process.env.PROBE_EMAIL;
  if (!url || !anon || !realEmail) {
    console.log("  SKIPPED — set PROBE_SUPABASE_URL, PROBE_SUPABASE_ANON_KEY, PROBE_EMAIL to run.");
    return [];
  }

  const count = opts.count ?? 12;
  const fakeEmail = `nobody+${crypto.randomUUID().slice(0, 8)}@${realEmail.split("@")[1]}`;
  const endpoint = `${url}/auth/v1/token?grant_type=password`;

  async function curve(email) {
    const times = [];
    const statuses = [];
    for (let i = 0; i < count; i++) {
      const r = await timedFetch(endpoint, {
        method: "POST",
        headers: { apikey: anon, "content-type": "application/json" },
        body: JSON.stringify({ email, password: `wrong-${i}-${crypto.randomUUID()}` }),
      });
      times.push(r.ms);
      statuses.push(r.status);
      await sleep(50);
    }
    return { times, statuses };
  }

  const real = await curve(realEmail);
  const fake = await curve(fakeEmail);

  const findings = [];
  const realMed = median(real.times);
  const fakeMed = median(fake.times);
  // Enumeration: if the real-account curve is consistently, materially slower
  // than the nonexistent one, response time is an account-existence oracle.
  // bcrypt-only-for-real-users gives an irreducible gap at the Supabase layer;
  // flag it as informational so it is visible, not passed off as fine.
  const gap = Math.abs(realMed - fakeMed);
  const sawThrottle = [...real.statuses, ...fake.statuses].some((s) => s === 429);

  console.log(`  real acct:  median ${realMed}ms p90 ${percentile(real.times, 90)}ms  statuses ${summarize(real.statuses)}`);
  console.log(`  fake acct:  median ${fakeMed}ms p90 ${percentile(fake.times, 90)}ms  statuses ${summarize(fake.statuses)}`);
  console.log(`  timing gap real-vs-fake: ${gap}ms · 429 seen: ${sawThrottle ? "yes" : "no"}`);

  findings.push({
    probe: "password-rate",
    route: "supabase /auth/v1/token",
    severity: "info",
    detail:
      `baseline (no app throttle asserted yet): real med ${realMed}ms, fake med ${fakeMed}ms, ` +
      `gap ${gap}ms, 429=${sawThrottle}. Enumeration risk if gap stays large once CAPTCHA is on.`,
  });
  return findings;
}

function summarize(statuses) {
  const counts = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return Object.entries(counts).map(([s, n]) => `${s}×${n}`).join(" ");
}
