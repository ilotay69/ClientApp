import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { isOverdue } from "@/lib/format";
import { FilterLink, filterHref } from "@/components/filter-link";
import { SearchBox } from "@/components/search-box";
import { SyncMailButton } from "@/components/sync-mail-button";

export const dynamic = "force-dynamic";

type SuggestionRow = { client_id: string; summary: string; priority: string };

/** Picks one suggestion per client from an already newest-first list —
 * prefers a "high" priority one if any exists, otherwise the most recent. */
function topSuggestionByClient(rows: SuggestionRow[]) {
  const map = new Map<string, SuggestionRow>();
  for (const r of rows) {
    const existing = map.get(r.client_id);
    if (!existing || (existing.priority !== "high" && r.priority === "high")) {
      map.set(r.client_id, r);
    }
  }
  return map;
}

function countByClient(rows: { client_id: string | null }[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.client_id) continue;
    map.set(r.client_id, (map.get(r.client_id) ?? 0) + 1);
  }
  return map;
}

function overdueCountByClient(rows: { client_id: string | null; due_date: string | null }[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.client_id || !isOverdue(r.due_date)) continue;
    map.set(r.client_id, (map.get(r.client_id) ?? 0) + 1);
  }
  return map;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view, q } = await searchParams;
  const supabase = await createClient();
  const [{ data: clients }, canManageClients, { data: openTasks }, { data: openTickets }, { data: openSuggestions }] =
    await Promise.all([
      (q
        ? supabase.from("clients").select("id, name").ilike("name", `%${q}%`).order("name")
        : supabase.from("clients").select("id, name").order("name")),
      hasPermission(supabase, "manage_clients"),
      supabase
        .from("tasks")
        .select("client_id, due_date")
        .not("client_id", "is", null)
        .not("status", "in", "(done,dismissed)"),
      supabase.from("autotask_tickets").select("client_id"),
      supabase
        .from("suggestions")
        .select("client_id, summary, priority")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
    ]);

  const overdueTaskCounts = overdueCountByClient(openTasks ?? []);
  const ticketCounts = countByClient(openTickets ?? []);
  const suggestions = topSuggestionByClient(openSuggestions ?? []);

  const visibleClients = (clients ?? []).filter((c) => {
    if (view === "insights") return suggestions.has(c.id);
    if (view === "overdue") return (overdueTaskCounts.get(c.id) ?? 0) > 0;
    if (view === "tickets") return (ticketCounts.get(c.id) ?? 0) > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
        <div className="flex items-center gap-2">
          <SyncMailButton label="Sync my mailbox" />
          {canManageClients && (
            <Link
              href="/clients/new"
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              New client
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FilterLink href={filterHref("/clients", { q })} active={!view}>
            All
          </FilterLink>
          <FilterLink
            href={filterHref("/clients", { view: "insights", q })}
            active={view === "insights"}
          >
            Open insights
          </FilterLink>
          <FilterLink
            href={filterHref("/clients", { view: "overdue", q })}
            active={view === "overdue"}
          >
            Overdue tasks
          </FilterLink>
          <FilterLink
            href={filterHref("/clients", { view: "tickets", q })}
            active={view === "tickets"}
          >
            Open tickets
          </FilterLink>
        </div>
        <SearchBox
          action="/clients"
          placeholder="Search clients…"
          defaultValue={q}
          keep={{ view }}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleClients.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
              </tr>
            ))}
            {visibleClients.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-slate-500">
                  {view || q ? (
                    <>
                      No clients match this filter.{" "}
                      <Link href="/clients" className="underline">
                        Clear filters
                      </Link>
                    </>
                  ) : (
                    <>
                      No clients yet.{" "}
                      <Link href="/clients/new" className="underline">
                        Add your first one.
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
