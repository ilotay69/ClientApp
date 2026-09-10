import { redirect } from "next/navigation";
import { getPortalIdentity } from "@/lib/portal";
import { PortalResetPasswordForm } from "@/components/portal-reset-password-form";

export const dynamic = "force-dynamic";

/**
 * Where a client-portal login lands whenever must_change_password is set —
 * a brand-new login, or one staff just reset with sendPortalPasswordReset
 * (team/client-access/actions.ts), which emails a temp password directly
 * rather than a Supabase magic link. requirePortalSession only returns this
 * state AFTER MFA is satisfied (see getPortalContext) — Supabase itself
 * refuses to update a password at AAL1 once any verified factor exists, so
 * by the time anyone reaches this page they're already AAL2.
 *
 * Deliberately gated on getPortalIdentity(), not requirePortalSession():
 * the latter would redirect straight back here for this exact state,
 * looping forever.
 */
export default async function PortalResetPasswordPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/login");

  return <PortalResetPasswordForm />;
}
