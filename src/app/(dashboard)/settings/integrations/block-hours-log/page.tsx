import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Kept off the Integrations page itself — the send log is an audit trail
 * you check occasionally ("did last month's actually go out?"), not
 * something worth a screenful every time someone opens Integrations to
 * change a setting. Shows more history here than the panel ever did,
 * since there's room for it. */
const LOG_LIMIT = 500;

type LogRow = {
  id: string;
  sent_at: string;
  client_name: string;
  to_email: string;
  cc_email: string | null;
  error: string | null;
};

export default async function BlockHoursReportLogPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_integrations"))) {
    redirect("/dashboard");
  }

  // Admin client — block_hours_report_log has no RLS policy for
  // authenticated users, same as the rest of this feature's tables.
  const admin = createAdminClient();
  const { data } = await admin
    .from("block_hours_report_log")
    .select("id, sent_at, client_name, to_email, cc_email, error")
    .order("sent_at", { ascending: false })
    .limit(LOG_LIMIT);
  const rows = (data ?? []) as LogRow[];
  const failures = rows.filter((r) => r.error).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/integrations" className="text-sm font-medium text-brand underline">
          ← Back to Integrations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Block of Hours Usage Report — Send log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every attempt, automated or manual — most recent first.
          {rows.length > 0 && (
            <>
              {" "}
              Showing the last {rows.length}
              {failures > 0 ? `, ${failures} of which failed.` : "."}
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Date</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Sent to</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">CC</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(entry.sent_at)}</td>
                  <td className="px-4 py-2 text-slate-900">{entry.client_name}</td>
                  <td className="px-4 py-2 text-slate-700">{entry.to_email}</td>
                  <td className="px-4 py-2 text-slate-700">{entry.cc_email ?? "—"}</td>
                  <td className={`px-4 py-2 ${entry.error ? "text-red-600" : "text-emerald-700"}`}>
                    {entry.error ?? "Sent"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Nothing sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
