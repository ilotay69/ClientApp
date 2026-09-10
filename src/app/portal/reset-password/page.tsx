import { redirect } from "next/navigation";
import { getPortalIdentity } from "@/lib/portal";
import { PortalResetPasswordForm } from "@/components/portal-reset-password-form";

export const dynamic = "force-dynamic";

/**
 * Where a client-portal login lands whenever must_change_password is set —
 * a brand-new login, or one staff just reset with sendPortalPasswordReset
 * (team/client-access/actions.ts), which emails a temp password directly
 * rather than a Supabase magic link. requirePortalSession sends them here on
 * its own; reaching it any other way still works via the identity check
 * below.
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
