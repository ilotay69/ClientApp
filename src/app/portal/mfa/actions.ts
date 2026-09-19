"use server";

import { createMutableClient } from "@/lib/supabase/server";
import { getPortalContext, getPortalIdentity } from "@/lib/portal";
import { recordAuthAttempt } from "@/lib/auth-attempts";
import { evaluateThrottle, applyThrottle } from "@/lib/auth-throttle";

export type MfaVerifyResult = { ok: true } | { ok: false; error: string };

/** Longest input accepted before anything else looks at it. A TOTP code is
 * six digits; this leaves room for a pasted "123 456" or "Code: 123456"
 * without accepting a megabyte of text that then gets regex-scanned. */
const MAX_CODE_INPUT_LENGTH = 64;

/**
 * Verifies a TOTP code and steps the session up to AAL2.
 *
 * This used to run in the browser. Moving it here is what makes failed
 * attempts observable at all: with challenge() and verify() called from the
 * client, the server never saw a wrong code, so nothing could be counted,
 * rate-limited, audited or alerted on. That is where the attempt recording
 * from the rate-limiting workstream will attach.
 *
 * The cookie mechanics, verified against the installed packages rather than
 * assumed: mfa.verify() ends with
 * `await this._notifyAllSubscribers('MFA_CHALLENGE_VERIFIED', data)`, and
 * _notifyAllSubscribers awaits Promise.all over its listeners. @supabase/ssr's
 * createServerClient registers a listener whose event allow-list names
 * MFA_CHALLENGE_VERIFIED explicitly, and that listener calls our setAll →
 * cookieStore.set. A Server Action's cookie store is writable. So by the time
 * the await below resolves, the new AAL2 cookies are already on this
 * response.
 *
 * Deliberately does NOT redirect. redirect() throws, which would make every
 * failure path harder to reason about; the caller navigates on { ok: true }
 * so a wrong code stays an inline message instead of a page transition.
 */
export async function verifyMfaCodeAction(input: { code: string }): Promise<MfaVerifyResult> {
  const identity = await getPortalIdentity();
  if (!identity) return { ok: false, error: "You're not signed in any more. Please sign in again." };

  // Length-checked before stripping, not after: strip-then-check would
  // happily regex its way through an arbitrarily large string first.
  const raw = input?.code ?? "";
  if (typeof raw !== "string" || raw.length > MAX_CODE_INPUT_LENGTH) {
    return { ok: false, error: "That code wasn't right. Please try again." };
  }
  const code = raw.replace(/\D/g, "");
  if (code.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await createMutableClient();

  // Which factor to use is decided HERE, from the session, rather than taken
  // from the client. The browser used to pass a factorId; GoTrue scopes
  // factors to the session so that was not exploitable, but a value the
  // server derives itself is one less thing to validate and makes any future
  // audit row trustworthy.
  const context = await getPortalContext();
  if (context.state === "ok") return { ok: true }; // already AAL2, nothing to do
  const enrolling = context.state === "needs_enrolment";

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) {
    console.error("verifyMfaCodeAction: listFactors failed", listError);
    return { ok: false, error: "We couldn't check your authenticator. Please try again." };
  }

  // `factors.totp` contains VERIFIED factors only. That is right for the
  // step-up path and wrong for enrolment, where the factor we just created is
  // by definition still unverified — reading factors.totp[0] during
  // enrolment finds nothing and fails every single time.
  const factor = enrolling
    ? factors.all?.find((f) => f.factor_type === "totp" && f.status === "unverified")
    : factors.totp?.[0];

  if (!factor) {
    return {
      ok: false,
      error: enrolling
        ? "Your setup didn't finish. Please reload the page and scan the code again."
        : "No authenticator is set up on this account yet.",
    };
  }

  // Same shape as the password path: delay from prior failures before the
  // verify call. Keyed on the user id — the session already identifies who
  // this is, so there is nothing to enumerate here.
  const decision = await evaluateThrottle({ surface: "mfa_verify", subject: identity.userId });
  await applyThrottle(decision, "mfa_verify");

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    console.error("verifyMfaCodeAction: challenge failed", challengeError);
    return { ok: false, error: "We couldn't verify that code. Please try again." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });
  await recordAuthAttempt({
    surface: "mfa_verify",
    // The user id, not an email: by this point the session already
    // identifies who this is, so there is nothing to enumerate.
    subject: identity.userId,
    succeeded: !verifyError,
  });

  if (verifyError) {
    // Generic on purpose. The browser used to surface error.message straight
    // from Supabase; the current wording is harmless, but returning it raw
    // means a future change to Supabase's copy silently changes what this
    // app tells an attacker.
    return { ok: false, error: "That code wasn't right. Please try again." };
  }

  return { ok: true };
}
