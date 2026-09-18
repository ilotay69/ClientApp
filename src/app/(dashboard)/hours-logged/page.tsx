import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMyPermissions, isStaffRole } from "@/lib/permissions";
import { fetchLoggedHoursForMonth, dayOfMonth, type LoggedHoursEntry } from "@/lib/logged-hours";
import { LoggedHoursForm } from "@/components/logged-hours-form";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import { filterHref } from "@/components/filter-link";
import { upsertLoggedHoursAction, deleteLoggedHoursAction } from "./actions";

export const dynamic = "force-dynamic";

function parseMonthParam(month: string | undefined): { year: number; month: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A plain self-reported timesheet, split into the two standard semi-
 * monthly payroll halves - separate from Autotask's own time entries (Team
 * Hours widget, Reports -> Resource hours), which this doesn't touch at
 * all. Every staff member logs and sees their own hours; an owner
 * additionally sees everyone else's below their own, read-only (checked
 * directly off profiles.role - there's no permission for this, matching
 * how getMyPermissions already treats 'owner' as a hardcoded full grant). */
export default async function HoursLoggedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParamValue } = await searchParams;
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) redirect("/dashboard");

  const { year, month } = parseMonthParam(monthParamValue);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const isOwner = me.role === "owner";

  const admin = createAdminClient();
  const [myEntries, allEntries] = await Promise.all([
    fetchLoggedHoursForMonth(year, month, { userId: me.userId }, admin),
    isOwner ? fetchLoggedHoursForMonth(year, month, {}, admin) : Promise.resolve([]),
  ]);

  const splitHalves = (entries: LoggedHoursEntry[]) => ({
    first: entries.filter((e) => dayOfMonth(e.workDate) <= 15),
    second: entries.filter((e) => dayOfMonth(e.workDate) > 15),
  });
  const myHalves = splitHalves(myEntries);
  const teamHalves = isOwner ? splitHalves(allEntries) : null;

  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hours Logged</h1>
        <p className="mt-1 text-sm text-slate-500">
          Log the hours you worked each day - split into the 1st–15th and 16th–end of month.
        </p>
      </div>

      <LoggedHoursForm action={upsertLoggedHoursAction} defaultDate={today} />

      <div className="flex items-center justify-center gap-3">
        <Link
          href={filterHref("/hours-logged", { month: monthParam(prev.year, prev.month) })}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          ← Prev
        </Link>
        <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
        <Link
          href={filterHref("/hours-logged", { month: monthParam(next.year, next.month) })}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Next →
        </Link>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">My hours</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HalfCard title="1st – 15th" entries={myHalves.first} deleteAction={deleteLoggedHoursAction} />
          <HalfCard title="16th – End of month" entries={myHalves.second} deleteAction={deleteLoggedHoursAction} />
        </div>
      </div>

      {isOwner && teamHalves && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Team hours</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TeamHalfCard title="1st – 15th" entries={teamHalves.first} />
            <TeamHalfCard title="16th – End of month" entries={teamHalves.second} />
          </div>
        </div>
      )}
    </div>
  );
}

function HalfCard({
  title,
  entries,
  deleteAction,
}: {
  title: string;
  entries: LoggedHoursEntry[];
  deleteAction: (id: string) => Promise<void>;
}) {
  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm font-semibold text-teal-700">{total.toFixed(2)}h</p>
      </div>
      <div className="divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2">
            <span className="text-sm text-slate-700">{formatDate(e.workDate)}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular-nums text-slate-900">{e.hours.toFixed(2)}h</span>
              <DeleteButton
                action={deleteAction.bind(null, e.id)}
                confirmText={`Remove the ${e.hours}h entry for ${formatDate(e.workDate)}?`}
                label="Remove"
              />
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </div>
    </div>
  );
}

/** Grouped by staff member within the half - the same "section header with
 * a subtotal, then its rows" pattern as the Team Hours dashboard widget's
 * own drill-down (/dashboard/resource-hours), for the same reason: a flat
 * list of everyone's entries interleaved by date would need constant
 * re-reading of a name column to tell whose day is whose. */
function TeamHalfCard({ title, entries }: { title: string; entries: LoggedHoursEntry[] }) {
  const byUser = new Map<string, { userId: string; userName: string; entries: LoggedHoursEntry[] }>();
  for (const e of entries) {
    const g = byUser.get(e.userId) ?? { userId: e.userId, userName: e.userName, entries: [] };
    g.entries.push(e);
    byUser.set(e.userId, g);
  }
  const groups = [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName));
  const total = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm font-semibold text-teal-700">{total.toFixed(2)}h</p>
      </div>
      <div className="divide-y divide-slate-200">
        {groups.map((g) => {
          const groupTotal = g.entries.reduce((sum, e) => sum + e.hours, 0);
          return (
            <div key={g.userId}>
              <div className="flex items-center justify-between bg-slate-50 px-4 py-1.5">
                <p className="text-xs font-semibold text-slate-700">{g.userName}</p>
                <p className="text-xs font-semibold text-slate-500">{groupTotal.toFixed(2)}h</p>
              </div>
              <div className="divide-y divide-slate-100">
                {g.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-1.5">
                    <span className="text-sm text-slate-700">{formatDate(e.workDate)}</span>
                    <span className="text-sm font-medium tabular-nums text-slate-900">{e.hours.toFixed(2)}h</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </div>
    </div>
  );
}
