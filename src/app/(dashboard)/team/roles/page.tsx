import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  hasPermission,
  ALL_PERMISSION_KEYS,
  PERMISSION_LABELS,
  type PermissionKey,
} from "@/lib/permissions";
import { PermissionMatrix } from "@/components/permission-matrix";
import { updateRolePermission } from "./actions";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_roles"))) {
    redirect("/dashboard");
  }

  const { data: rows } = await supabase
    .from("role_permissions")
    .select("role, permission, enabled");

  const grants: Record<"manager" | "tech", Set<PermissionKey>> = {
    manager: new Set(),
    tech: new Set(),
  };
  for (const row of rows ?? []) {
    if (row.enabled && (row.role === "manager" || row.role === "tech")) {
      grants[row.role].add(row.permission as PermissionKey);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/team" className="text-sm text-slate-500 hover:underline">
          ← Team
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Roles &amp; permissions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Owner always has full access. Toggle what Manager and Tech can do —
          changes apply immediately, team-wide.
        </p>
      </div>

      <PermissionMatrix
        permissions={ALL_PERMISSION_KEYS}
        labels={PERMISSION_LABELS}
        grants={grants}
        action={updateRolePermission}
      />
    </div>
  );
}
