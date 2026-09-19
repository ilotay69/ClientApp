import { notFound } from "next/navigation";
import { PasskeyTestClient } from "@/components/passkey-test-client";

export const dynamic = "force-dynamic";

/**
 * THROWAWAY. Delete this route and its client component once the passkey
 * aal/amr question is answered — it exists only to run one WebAuthn ceremony
 * on a real staging origin and read what GoTrue puts in the session.
 *
 * Gated on NEXT_PUBLIC_ENV_LABEL, which is set on staging and unset on
 * production (same signal the env banner and the probe harness use), so this
 * page 404s in production even while it exists in the build.
 */
export default function PasskeyTestPage() {
  if (!process.env.NEXT_PUBLIC_ENV_LABEL?.trim()) notFound();
  return <PasskeyTestClient />;
}
