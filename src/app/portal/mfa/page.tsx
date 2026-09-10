import { redirect } from "next/navigation";
import { getPortalContext, getPortalIdentity } from "@/lib/portal";
import { PortalMfaSetup } from "@/components/portal-mfa-setup";

export const dynamic = "force-dynamic";

/**
 * The one portal route that deliberately does NOT require AAL2 — requiring it
 * here would lock a new client out of the only page that lets them enrol.
 *
 * It still refuses anyone who isn't a signed-in portal login
 * (getPortalIdentity), and it hands out no client data whatsoever.
 */
export default async function PortalMfaPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/");

  // Already fully signed in? Nothing to do here.
  const context = await getPortalContext();
  if (context.state === "ok") redirect("/portal");
  // Still on a temp password — that has to happen before MFA enrolment.
  if (context.state === "needs_password_change") redirect("/portal/reset-password");

  const mode = context.state === "needs_verification" ? "verify" : "enrol";
  return <PortalMfaSetup mode={mode} />;
}
