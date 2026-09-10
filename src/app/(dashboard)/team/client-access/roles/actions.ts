"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { PORTAL_PAGE_KEYS, type ClientPortalRole, type PortalPageKey } from "@/lib/portal";

/** Mirrors updateRolePermission (Team -> Roles & permissions) for the
 * client-portal side — same upsert-on-composite-key shape, same
 * clear-error-over-silent-failure reasoning. */
export async function updateClientPortalPermission(
  role: ClientPortalRole,
  page: PortalPageKey,
  enabled: boolean
): Promise<{ error?: string }> {
  if (!(PORTAL_PAGE_KEYS as readonly string[]).includes(page)) {
    return { error: "Not a real portal page." };
  }
  if (!(await requirePermission("manage_client_access"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("client_portal_permissions")
    .upsert({ client_role: role, portal_page: page, enabled }, { onConflict: "client_role,portal_page" });
  if (error) {
    console.error("updateClientPortalPermission failed", error);
    return { error: error.message };
  }

  revalidatePath("/team/client-access/roles");
  return {};
}
