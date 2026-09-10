import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ClientAccessPanel } from "@/components/client-access-panel";
import {
  listPortalUsers,
  createPortalUser,
  sendPortalPasswordReset,
  resetPortalUserMfa,
  removePortalUser,
  updatePortalUserRole,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientAccessPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_client_access"))) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const [portalUsers, { data: clients }] = await Promise.all([
    listPortalUsers(),
    admin.from("clients").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/team" className="text-sm text-slate-500 hover:underline">
          ← Team
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Client access</h1>
          <Link
            href="/team/client-access/roles"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Manage permissions →
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Read-only portal logins for clients. Each login sees only its own company&apos;s
          data, has no access to any staff page, and is required to set up an authenticator
          app before it can see anything. Which portal pages a login can see depends on its
          role — see &quot;Manage permissions&quot; above.
        </p>
      </div>

      <ClientAccessPanel
        portalUsers={portalUsers}
        clients={(clients ?? []) as { id: string; name: string }[]}
        createAction={createPortalUser}
        resetPasswordAction={sendPortalPasswordReset}
        resetMfaAction={resetPortalUserMfa}
        removeAction={removePortalUser}
        updateRoleAction={updatePortalUserRole}
      />
    </div>
  );
}
