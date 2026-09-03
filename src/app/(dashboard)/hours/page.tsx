import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ResourceHoursReport } from "@/components/resource-hours-report";
import { SyncTimeEntriesButton } from "@/components/sync-time-entries-button";
import { lastBusinessDayBefore, ymd } from "@/lib/resource-hours";
import { formatDate } from "@/lib/format";
import { fetchResourceHoursAction, syncYesterdayTimeEntriesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_team"))) {
    redirect("/dashboard");
  }

  const yesterdayStr = ymd(lastBusinessDayBefore(new Date()));

  const { data: entries } = await supabase
    .from("autotask_time_entries")
    .select("id, resource_name, hours_worked, ticket_id, summary_notes, clients(name)")
    .eq("date_worked", yesterdayStr)
    .order("resource_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hours</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time logged in Autotask, by resource — today, yesterday, this week, and this month.
        </p>
      </div>

      <ResourceHoursReport action={fetchResourceHoursAction} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Time entries — {formatDate(yesterdayStr)}
            </h2>
            <p className="text-xs text-slate-500">
              Stored, not live — this is history, kept so patterns across days and clients can be
              looked at later, not just a snapshot of right now.
            </p>
          </div>
          <SyncTimeEntriesButton action={syncYesterdayTimeEntriesAction} />
        </div>
        <div className="divide-y divide-slate-100">
          {(entries ?? []).map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {e.resource_name}
                  {(e.clients as unknown as { name: string } | null)?.name
                    ? ` — ${(e.clients as unknown as { name: string } | null)?.name}`
                    : ""}
                  {e.ticket_id ? ` (Ticket #${e.ticket_id})` : ""}
                </p>
                {e.summary_notes && (
                  <p className="mt-0.5 text-xs text-slate-500">{e.summary_notes}</p>
                )}
              </div>
              <span className="shrink-0 text-sm text-slate-700">{e.hours_worked}h</span>
            </div>
          ))}
          {(entries ?? []).length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              Nothing stored for this day yet — click &quot;Sync yesterday&apos;s entries&quot;
              above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
