import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatDate, isOverdue } from "@/lib/format";
import { isOwner } from "@/lib/permissions";
import { FilterLink, filterHref } from "@/components/filter-link";

export const dynamic = "force-dynamic";

const CONTACT_METHOD_FILTERS = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
];

export default async function TouchpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; type?: string }>;
}) {
  const { view, type } = await searchParams;
  const supabase = await createClient();

  // A relationship-contact log (who said what, when to follow up) is
  // owner-only, not gated by role_permissions like everything else here.
  if (!(await isOwner(supabase))) {
    redirect("/dashboard");
  }

  let touchpointsQuery = supabase
    .from("touchpoints")
    .select("id, contact_method, due_date, completed_at, outcome, clients(name)")
    .order("due_date", { ascending: true });

  // "Overdue" is outstanding *and* past due — the same rule the OverdueBadge
  // uses below, applied in the query so the count matches what's rendered.
  if (view === "outstanding" || view === "overdue") {
    touchpointsQuery = touchpointsQuery.is("completed_at", null);
  }
  if (view === "overdue") {
    touchpointsQuery = touchpointsQuery.lt("due_date", new Date().toISOString().slice(0, 10));
  }
  if (view === "completed") {
    touchpointsQuery = touchpointsQuery.not("completed_at", "is", null);
  }
  if (type) touchpointsQuery = touchpointsQuery.eq("contact_method", type);

  const { data: touchpoints } = await touchpointsQuery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Touchpoints</h1>
        <Link
          href="/touchpoints/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          New touchpoint
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterLink href={filterHref("/touchpoints", { type })} active={!view}>
          All
        </FilterLink>
        <FilterLink
          href={filterHref("/touchpoints", { view: "outstanding", type })}
          active={view === "outstanding"}
        >
          Outstanding
        </FilterLink>
        <FilterLink
          href={filterHref("/touchpoints", { view: "overdue", type })}
          active={view === "overdue"}
        >
          Overdue
        </FilterLink>
        <FilterLink
          href={filterHref("/touchpoints", { view: "completed", type })}
          active={view === "completed"}
        >
          Completed
        </FilterLink>

        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />

        {CONTACT_METHOD_FILTERS.map((f) => (
          <FilterLink
            key={f.value}
            href={filterHref("/touchpoints", { view, type: type === f.value ? undefined : f.value })}
            active={type === f.value}
          >
            {f.label}
          </FilterLink>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">How contacted</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Outcome</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Next contact</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(touchpoints ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-2">
                  <Link href={`/touchpoints/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {(t.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </Link>
                </td>
                <td className="px-5 py-2">
                  {t.contact_method ? <Badge value={t.contact_method} /> : "—"}
                </td>
                <td className="max-w-xs truncate px-5 py-2 text-slate-600">{t.outcome ?? "—"}</td>
                <td className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">{formatDate(t.due_date)}</span>
                    {!t.completed_at && isOverdue(t.due_date) && <OverdueBadge />}
                  </div>
                </td>
                <td className="px-5 py-2 text-slate-600">
                  {t.completed_at ? `Completed ${formatDate(t.completed_at)}` : "Not completed"}
                </td>
              </tr>
            ))}
            {(touchpoints ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                  {view || type ? (
                    <>
                      No touchpoints match this filter.{" "}
                      <Link href="/touchpoints" className="underline">
                        Clear filters
                      </Link>
                    </>
                  ) : (
                    <>
                      No touchpoints scheduled.{" "}
                      <Link href="/touchpoints/new" className="underline">
                        Schedule your first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
