import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { PORTAL_PAGE_KEYS, type ClientPortalRole, type PortalPageKey } from "@/lib/portal";
import { ClientPortalPermissionMatrix } from "@/components/client-portal-permission-matrix";
import { updateClientPortalPermission } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientPortalRolesPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_client_access"))) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("client_portal_permissions")
    .select("client_role, portal_page, enabled");

  const grants: Record<ClientPortalRole, Set<PortalPageKey>> = {
    client_tech: new Set(),
    client_manager: new Set(),
    client_owner: new Set(),
  };
  type Row = { client_role: ClientPortalRole; portal_page: string; enabled: boolean };
  for (const row of (rows ?? []) as Row[]) {
    if (row.enabled && (PORTAL_PAGE_KEYS as readonly string[]).includes(row.portal_page)) {
      grants[row.client_role].add(row.portal_page as PortalPageKey);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/team/client-access" className="text-sm text-slate-500 hover:underline">
          ← Client access
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Client portal roles</h1>
        <p className="mt-1 text-sm text-slate-500">
          Toggle which portal pages Client Tech, Client Manager, and Client Owner logins can
          see — changes apply immediately, across every client. Overview isn&apos;t listed here:
          every portal login can always reach it.
        </p>
      </div>

      <ClientPortalPermissionMatrix
        pages={[...PORTAL_PAGE_KEYS]}
        grants={grants}
        action={updateClientPortalPermission}
      />
    </div>
  );
}
