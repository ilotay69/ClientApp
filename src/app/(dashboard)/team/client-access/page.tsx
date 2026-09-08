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
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Client access</h1>
        <p className="mt-1 text-sm text-slate-500">
          Read-only portal logins for clients. Each login sees only its own company&apos;s
          data, has no access to any staff page, and is required to set up an authenticator
          app before it can see anything.
        </p>
      </div>

      <ClientAccessPanel
        portalUsers={portalUsers}
        clients={(clients ?? []) as { id: string; name: string }[]}
        createAction={createPortalUser}
        resetPasswordAction={sendPortalPasswordReset}
        resetMfaAction={resetPortalUserMfa}
        removeAction={removePortalUser}
      />
    </div>
  );
}
