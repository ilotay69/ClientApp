/**
 * Server-side verification of a Cloudflare Turnstile token.
 *
 * NOT for the login or passkey paths: those pass the token to Supabase as
 * `options.captchaToken`, and Supabase verifies it itself at the GoTrue layer
 * — which is the whole point, because that layer also covers a direct hit on
 * /auth/v1/token that never touches our form. Verifying it here as well would
 * consume the single-use token before Supabase could.
 *
 * This is for the UNAUTHENTICATED action routes (proposal accept, review ack,
 * brochure) that have no Supabase equivalent to verify for them. Wiring those
 * up is a later step; this helper is what they will call.
 */
export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/** True only when Turnstile is actually configured. Callers can use this to
 * stay inert until the keys exist, so the code can ship before the account
 * setup does. */
export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Unconfigured means "don't gate on it yet", not "fail". The moment a
  // secret is set, a missing or bad token starts failing.
  if (!secret) return { ok: true };
  if (!token) return { ok: false, reason: "missing-token" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
  } catch (err) {
    console.error("verifyTurnstileToken failed", err);
    // Fail OPEN on a Cloudflare outage rather than locking everyone out of an
    // action over a third-party being down. The subject/IP throttle is still
    // in play underneath.
    return { ok: true };
  }
}
