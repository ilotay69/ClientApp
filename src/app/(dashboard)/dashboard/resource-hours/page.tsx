import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { fetchResourceDayEntriesAction } from "../../hours/actions";
import type { ResourceDayEntry } from "@/lib/resource-hours";

export const dynamic = "force-dynamic";

/** The Team Hours dashboard widget's drill-down — one click surfaces every
 * technician's entries for the day (grouped below by who logged them),
 * rather than being scoped to whichever row happened to be clicked. Same
 * permission as the widget (view_lookups). */
export default async function ResourceHoursDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_lookups"))) redirect("/dashboard");
  if (!date) redirect("/dashboard");

  const result = await fetchResourceDayEntriesAction(date);

  const totalHours = "entries" in result ? result.entries.reduce((sum, e) => sum + e.hoursWorked, 0) : 0;

  const groups: { resourceId: string; resourceName: string; entries: ResourceDayEntry[] }[] = [];
  if ("entries" in result) {
    const byResource = new Map<string, { resourceId: string; resourceName: string; entries: ResourceDayEntry[] }>();
    for (const e of result.entries) {
      const group = byResource.get(e.resourceId) ?? {
        resourceId: e.resourceId,
        resourceName: e.resourceName,
        entries: [],
      };
      group.entries.push(e);
      byResource.set(e.resourceId, group);
    }
    groups.push(
      ...[...byResource.values()].sort(
        (a, b) =>
          b.entries.reduce((sum, e) => sum + e.hoursWorked, 0) -
          a.entries.reduce((sum, e) => sum + e.hoursWorked, 0)
      )
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to Dashboard
      </Link>

      {"error" in result ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {result.error}
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Team time entries</h1>
              <p className="text-sm text-slate-500">{formatDate(date)}</p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-teal-600">{totalHours.toFixed(1)}h</span>
          </div>

          {groups.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No time entries logged on this day.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {groups.map((group) => {
                const groupHours = group.entries.reduce((sum, e) => sum + e.hoursWorked, 0);
                return (
                  <div key={group.resourceId}>
                    <div className="flex items-center justify-between bg-slate-50 px-5 py-2">
                      <p className="text-sm font-semibold text-slate-900">{group.resourceName}</p>
                      <p className="text-sm font-semibold tabular-nums text-teal-700">
                        {groupHours.toFixed(1)}h
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.entries.map((e) => (
                        <div key={e.id} className="px-5 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {e.ticketNumber ? `${e.ticketNumber} — ` : ""}
                                {e.ticketTitle ?? (e.ticketId ? `Ticket ${e.ticketId}` : "No ticket")}
                              </p>
                              {e.clientName && <p className="text-xs text-slate-500">{e.clientName}</p>}
                              {e.summaryNotes && (
                                <p className="mt-1 text-xs text-slate-500">{e.summaryNotes}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                              {e.hoursWorked.toFixed(1)}h
                              {e.isNonBillable && (
                                <span className="ml-1 text-xs font-normal text-slate-400">(NB)</span>
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
