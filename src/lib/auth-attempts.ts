import { createAdminClient } from "@/lib/supabase/server";
import { clientIp, hashWithSalt } from "@/lib/client-ip";

/** Which authentication surface an attempt was made against. Kept in step
 * with the `surface` values documented in supabase/152_auth_attempts.sql. */
export type AuthSurface =
  | "password_signin"
  | "mfa_verify"
  | "passkey_signin"
  | "proposal_view"
  | "proposal_accept"
  | "review_ack"
  | "brochure";

let warnedAboutMissingSalt = false;

/**
 * Records one authentication attempt. Nothing reads this yet — see the
 * migration for why recording ships before throttling does.
 *
 * Three properties this function guarantees, in order of importance:
 *
 * 1. **It never throws into the caller.** This sits directly in the sign-in
 *    path. A failed insert, a dropped database connection, a missing
 *    environment variable — none of those may stop someone logging in. An
 *    observability feature that can take down authentication is worse than
 *    no observability feature.
 * 2. **It never stores a raw email, token or IP address.** Everything
 *    identifying is salted-hashed first.
 * 3. **It does not silently fall back to a weak salt.** If
 *    AUTH_ATTEMPT_SALT is absent it logs once and records nothing, rather
 *    than hashing with a constant — a hardcoded fallback salt is no salt at
 *    all, and it would leave a table that LOOKS protected. Silence is
 *    honest; false protection is not.
 */
export async function recordAuthAttempt(params: {
  surface: AuthSurface;
  /** The submitted email (any case), a user id, or a token — whatever the
   * attempt was aimed at. Hashed before storage. */
  subject?: string | null;
  succeeded: boolean;
}): Promise<void> {
  try {
    const salt = process.env.AUTH_ATTEMPT_SALT;
    if (!salt) {
      if (!warnedAboutMissingSalt) {
        warnedAboutMissingSalt = true;
        console.error(
          "AUTH_ATTEMPT_SALT is not set — authentication attempts are NOT being recorded. " +
            "Generate one with `openssl rand -base64 32` and set it in Railway."
        );
      }
      return;
    }

    // Normalised before hashing so "Alex@Example.com" and "alex@example.com"
    // count as the same subject. Without this, varying the case is enough to
    // reset a counter.
    const subject = params.subject?.trim().toLowerCase();
    const ip = await clientIp();

    const admin = createAdminClient();
    const { error } = await admin.from("auth_attempts").insert({
      surface: params.surface,
      subject_hash: subject ? hashWithSalt(subject, salt) : null,
      ip_hash: ip ? hashWithSalt(ip, salt) : null,
      succeeded: params.succeeded,
    });
    if (error) console.error("recordAuthAttempt: insert failed", error);
  } catch (err) {
    console.error("recordAuthAttempt failed", err);
  }
}
