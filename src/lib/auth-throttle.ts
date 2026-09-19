import { createAdminClient } from "@/lib/supabase/server";
import { clientIp, hashWithSalt } from "@/lib/client-ip";
import type { AuthSurface } from "@/lib/auth-attempts";

/**
 * Progressive delay against credential stuffing and code guessing.
 *
 * Three things about the shape of this, before the numbers:
 *
 * 1. It is a DELAY, never a lockout. The plan rejected hard lockout outright:
 *    a permanent freeze keyed on an email lets anyone lock out a client by
 *    knowing their address. A delay keyed on the same email is only ever an
 *    annoyance, and it self-heals as the failures age out of the window.
 *
 * 2. The delay is computed from PRIOR failures and applied BEFORE the auth
 *    call, identically whether or not the account exists — because the count
 *    is keyed on the submitted email, not on a resolved user. A curve that
 *    only slowed real accounts would be an account-existence oracle, and
 *    every client here sits at a known company domain.
 *
 * 3. There is no hard rejection at the top of the curve yet. The plan's
 *    "reject and show a challenge" needs Turnstile, which ships separately.
 *    Until then the curve is delay-only, capped, so it can never become a
 *    lockout-by-another-name. `requireChallenge` is computed and surfaced now
 *    so the Turnstile step is a wiring change, not a redesign.
 *
 * MODE, from AUTH_THROTTLE_MODE, is what makes "build now, tune later" safe:
 *   off      (default) — do nothing. Recording still happens elsewhere.
 *   dryrun            — compute and LOG the delay that WOULD apply; do not
 *                       delay anyone. This is how the curve is tuned against
 *                       real traffic before it can hurt a real user.
 *   enforce           — actually apply the delay.
 * A missing or unknown value means off. Flipping to enforce is an env change,
 * no deploy.
 */
export type ThrottleMode = "off" | "dryrun" | "enforce";

export function throttleMode(): ThrottleMode {
  const raw = process.env.AUTH_THROTTLE_MODE?.trim();
  return raw === "dryrun" || raw === "enforce" ? raw : "off";
}

// ---- Tunable curve. These are a STARTING POINT, not a measurement. The
// recording-only period exists precisely so these get set against this
// team's real failure rate. Change them here; nothing else needs to know. ----

const WINDOW_MINUTES = 15;

/** Delay in ms by number of failures in the window. Index 0..N; anything at
 * or past the last entry uses the last (the cap). The cap is the single most
 * important number: uncapped backoff is a self-inflicted DoS, since N slow
 * connections each sleeping for a minute exhaust the process with no real
 * traffic. */
const SUBJECT_DELAY_MS = [0, 0, 0, 1000, 2000, 4000, 8000];

/** Above this many failures for a subject, a challenge should be required
 * (Turnstile, once it exists). */
const SUBJECT_CHALLENGE_AT = 4;

/** IP thresholds are looser: shared office NAT means many people behind one
 * address, so a low IP threshold throttles a whole client site together. */
const IP_DELAY_MS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 2000, 4000, 8000];
const IP_CHALLENGE_AT = 20;

function curve(table: number[], failures: number): number {
  return table[Math.min(failures, table.length - 1)];
}

export type ThrottleDecision = {
  subjectFailures: number;
  ipFailures: number;
  delayMs: number;
  requireChallenge: boolean;
};

/**
 * Reads recent failure counts and computes the decision. Never throws into
 * the caller — a throttle that can break sign-in is worse than no throttle —
 * and returns a zero decision if the salt is missing (same reasoning as
 * recording: no silent weak fallback).
 */
export async function evaluateThrottle(params: {
  surface: AuthSurface;
  subject?: string | null;
}): Promise<ThrottleDecision> {
  const zero: ThrottleDecision = { subjectFailures: 0, ipFailures: 0, delayMs: 0, requireChallenge: false };
  try {
    const salt = process.env.AUTH_ATTEMPT_SALT;
    if (!salt) return zero;

    const subject = params.subject?.trim().toLowerCase();
    const ip = await clientIp();
    const subjectHash = subject ? hashWithSalt(subject, salt) : null;
    const ipHash = ip ? hashWithSalt(ip, salt) : null;
    if (!subjectHash && !ipHash) return zero;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("auth_attempt_state", {
      p_surface: params.surface,
      p_subject_hash: subjectHash,
      p_ip_hash: ipHash,
      p_window_minutes: WINDOW_MINUTES,
    });
    if (error) {
      console.error("evaluateThrottle: rpc failed", error);
      return zero;
    }
    // rpc returns a single row (a table function with one aggregate row).
    const row = Array.isArray(data) ? data[0] : data;
    const subjectFailures = row?.subject_failures ?? 0;
    const ipFailures = row?.ip_failures ?? 0;

    const delayMs = Math.max(curve(SUBJECT_DELAY_MS, subjectFailures), curve(IP_DELAY_MS, ipFailures));
    const requireChallenge = subjectFailures >= SUBJECT_CHALLENGE_AT || ipFailures >= IP_CHALLENGE_AT;
    return { subjectFailures, ipFailures, delayMs, requireChallenge };
  } catch (err) {
    console.error("evaluateThrottle failed", err);
    return zero;
  }
}

/**
 * Applies the decision according to the mode, and returns whether a challenge
 * should be required (for the caller to act on once Turnstile exists).
 *
 * In dryrun it logs what enforce would have done — that log IS the tuning
 * data: run it against real traffic for a week and confirm the delays only
 * ever land on genuine abuse before flipping to enforce.
 */
export async function applyThrottle(decision: ThrottleDecision, surface: AuthSurface): Promise<{ requireChallenge: boolean }> {
  const mode = throttleMode();
  if (mode === "off") return { requireChallenge: false };

  if (decision.delayMs > 0 || decision.requireChallenge) {
    console.warn(
      `[auth-throttle:${mode}] ${surface} subjectFailures=${decision.subjectFailures} ` +
        `ipFailures=${decision.ipFailures} → delay ${decision.delayMs}ms` +
        `${decision.requireChallenge ? " + challenge" : ""}${mode === "dryrun" ? " (not applied)" : ""}`
    );
  }

  if (mode === "enforce" && decision.delayMs > 0) {
    await new Promise((r) => setTimeout(r, decision.delayMs));
  }
  // requireChallenge only bites once Turnstile is wired; surfaced now so that
  // is a one-line change. In dryrun it never bites regardless.
  return { requireChallenge: mode === "enforce" && decision.requireChallenge };
}
