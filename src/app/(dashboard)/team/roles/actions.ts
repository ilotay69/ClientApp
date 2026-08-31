"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type PermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

export async function updateRolePermission(
  role: UserRole,
  permission: PermissionKey,
  enabled: boolean
) {
  // Owner is hardcoded to full access in app code — never a table row, so
  // there's nothing to toggle.
  if (role === "owner") return;
  if (!(await requirePermission("manage_roles"))) return;

  const supabase = await createClient();
  await supabase
    .from("role_permissions")
    .upsert({ role, permission, enabled }, { onConflict: "role,permission" });

  revalidatePath("/team/roles");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}
