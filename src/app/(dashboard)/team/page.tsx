import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/badge";
import { RoleSelect } from "@/components/role-select";
import { AddTeamMemberForm } from "@/components/add-team-member-form";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { updateMemberRole, addTeamMember } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!(await hasPermission(supabase, "manage_team"))) {
    redirect("/dashboard");
  }
  const canManageRoles = await hasPermission(supabase, "manage_roles");
  const canManageClientAccess = await hasPermission(supabase, "manage_client_access");

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    // Client-portal logins are not team members and must not appear in this
    // list — the RoleSelect beside each row would offer to turn a customer
    // into staff (updateMemberRole refuses, but it shouldn't be offered).
    // They're managed on their own screen: Team -> Client access.
    .neq("role", "client")
    .order("created_at");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage who has access and what role they hold. Accounts are created
            here — there is no self-serve sign-up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageClientAccess && (
            <Link
              href="/team/client-access"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Client access →
            </Link>
          )}
          {canManageRoles && (
            <Link
              href="/team/roles"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Manage permissions →
            </Link>
          )}
        </div>
      </div>

      <AddTeamMemberForm action={addTeamMember} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Name</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Email</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Joined</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(members ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-2 font-medium text-slate-900">{m.full_name}</td>
                <td className="px-5 py-2 text-slate-600">{m.email}</td>
                <td className="px-5 py-2 text-slate-600">{formatDate(m.created_at)}</td>
                <td className="px-5 py-2">
                  {m.id === user?.id ? (
                    <Badge value={m.role} />
                  ) : (
                    <RoleSelect
                      memberId={m.id}
                      currentRole={m.role}
                      action={updateMemberRole}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
