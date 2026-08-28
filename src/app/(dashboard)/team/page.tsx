import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/badge";
import { RoleSelect } from "@/components/role-select";
import { AddTeamMemberForm } from "@/components/add-team-member-form";
import { formatDate } from "@/lib/format";
import { updateMemberRole, addTeamMember } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (me?.role !== "director") {
    redirect("/dashboard");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage who has access and what role they hold. New sign-ups default
          to &quot;tech&quot;.
        </p>
      </div>

      <AddTeamMemberForm action={addTeamMember} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Email</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Joined</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(members ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{m.full_name}</td>
                <td className="px-5 py-3 text-slate-600">{m.email}</td>
                <td className="px-5 py-3 text-slate-600">{formatDate(m.created_at)}</td>
                <td className="px-5 py-3">
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
