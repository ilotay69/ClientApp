import { redirect } from "next/navigation";
import { getPortalIdentity } from "@/lib/portal";
import { PortalResetPasswordForm } from "@/components/portal-reset-password-form";

export const dynamic = "force-dynamic";

/**
 * Where a client-portal login lands after /auth/callback exchanges their
 * "Email password reset" link's code for a real session — see
 * sendPortalPasswordReset in team/client-access/actions.ts.
 *
 * Deliberately gated on getPortalIdentity(), not requirePortalSession(): a
 * brand-new portal login has no MFA factor yet, so the AAL2 check the latter
 * enforces would immediately bounce them to /portal/mfa before they ever get
 * to set a password — and setting one has to happen first.
 */
export default async function PortalResetPasswordPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/login");

  return <PortalResetPasswordForm />;
}
