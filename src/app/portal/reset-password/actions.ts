"use server";

import { getPortalIdentity } from "@/lib/portal";
import { createAdminClient } from "@/lib/supabase/server";

/** Clears must_change_password once the portal login has actually set a
 * real password (see PortalResetPasswordForm) — done through the admin
 * client rather than trusting a client-writable column, same reasoning as
 * every other portal write going through the service role. */
export async function clearMustChangePassword(): Promise<void> {
  const identity = await getPortalIdentity();
  if (!identity) return;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", identity.userId);
}
