/**
 * MFA brute-force characterisation.
 *
 * The verify path now runs in a Server Action (verifyMfaCodeAction), invoked
 * with a build-time action id rather than a stable URL, and it needs an AAL1
 * session to reach. Driving it end to end means a real browser session, which
 * belongs in an interactive staging test, not this headless harness.
 *
 * So this probe does not attempt the ceremony. It documents the two checks
 * that MUST be done by hand on staging once throttling ships, and it exists so
 * the harness names the gap instead of pretending to cover it:
 *
 *   1. Wrong code, submitted once, produces EXACTLY ONE row in auth_attempts.
 *      This is the auto-submit-loop guard. More than one row per wrong code
 *      means the loop guard failed and Supabase's 15/min MFA limit will lock
 *      out the real user.
 *   2. Repeated wrong codes are throttled well under Supabase's 15/min, and a
 *      correct code still works immediately afterwards (throttled, not
 *      locked out).
 *
 * Both are verified by querying auth_attempts through the staging MCP after
 * an interactive attempt, per the README.
 */
export async function run() {
  console.log("  NOT AUTOMATED — see README: verify one-row-per-wrong-code and throttle-not-lockout by hand.");
  return [];
}
