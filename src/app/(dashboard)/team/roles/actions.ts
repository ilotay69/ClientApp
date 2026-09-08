"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

export async function updateRolePermission(
  role: UserRole,
  permission: PermissionKey,
  enabled: boolean
): Promise<{ error?: string }> {
  // Owner is hardcoded to full access in app code — never a table row, so
  // there's nothing to toggle.
  if (role === "owner") return {};
  if (!(await requirePermission("manage_roles"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_permissions")
    .upsert({ role, permission, enabled }, { onConflict: "role,permission" });
  if (error) {
    // A permission key that doesn't exist yet in the database (a migration
    // adding it to the permission_key enum not yet run) previously failed
    // here completely silently — the checkbox stayed visually checked
    // (it was an uncontrolled input reflecting the click itself, not the
    // save), so a toggle that never actually persisted looked identical
    // to one that worked.
    console.error("updateRolePermission: failed to write role_permissions", error);
    return { error: error.message };
  }

  revalidatePath("/team/roles");
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return {};
}
