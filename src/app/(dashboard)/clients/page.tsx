import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/badge";
import { daysAgo, buildFollowupSummary, isOverdue } from "@/lib/format";

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

type TicketRow = { client_id: string; title: string; last_activity_at: string | null };

/** The ticket that's gone quietest the longest, per client — a much more
 * useful signal than a bare open-ticket count. Tickets with no activity
 * timestamp sort last (nothing to flag as stale). */
function stalestTicketByClient(rows: TicketRow[]) {
  const map = new Map<string, TicketRow>();
  for (const r of rows) {
    const existing = map.get(r.client_id);
    if (!existing) {
      map.set(r.client_id, r);
      continue;
    }
    if (!r.last_activity_at) continue;
    if (!existing.last_activity_at || r.last_activity_at < existing.last_activity_at) {
      map.set(r.client_id, r);
    }
  }
  return map;
}

/** First occurrence wins — callers pass rows already ordered newest-first. */
function latestByClient(rows: { client_id: string; created_at: string }[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!map.has(r.client_id)) map.set(r.client_id, r.created_at);
  }
  return map;
}

export default async function ClientsPage() {
  const supabase = await createClient();
  const [
    { data: clients },
    canManageClients,
    { data: openTasks },
    { data: openTickets },
    { data: openSuggestions },
    { data: interactions },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    hasPermission(supabase, "manage_clients"),
    supabase
      .from("tasks")
      .select("client_id, due_date")
      .not("client_id", "is", null)
      .not("status", "in", "(done,dismissed)"),
    supabase.from("autotask_tickets").select("client_id, title, last_activity_at"),
    supabase
      .from("suggestions")
      .select("client_id, summary, priority")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("client_interactions")
      .select("client_id, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const taskCounts = countByClient(openTasks ?? []);
  const overdueTaskCounts = overdueCountByClient(openTasks ?? []);
  const ticketCounts = countByClient(openTickets ?? []);
  const stalestTicket = stalestTicketByClient(openTickets ?? []);
  const suggestions = topSuggestionByClient(openSuggestions ?? []);
  const lastContact = latestByClient(interactions ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
        {canManageClients && (
          <Link
            href="/clients/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            New client
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">
                Insights &amp; followups
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(clients ?? []).map((c) => {
              const suggestion = suggestions.get(c.id);
              const taskCount = taskCounts.get(c.id) ?? 0;
              const ticketCount = ticketCounts.get(c.id) ?? 0;
              const contactDays = daysAgo(lastContact.get(c.id));
              const stale = stalestTicket.get(c.id);
              const followupText = buildFollowupSummary({
                taskCount,
                overdueTaskCount: overdueTaskCounts.get(c.id) ?? 0,
                ticketCount,
                stalestTicketTitle: stale?.title ?? null,
                stalestTicketDays: daysAgo(stale?.last_activity_at ?? null),
                lastContactDays: contactDays,
              });

              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {suggestion ? (
                      <div className="flex items-start gap-2">
                        {suggestion.priority === "high" && <Badge value="high" />}
                        <span className="text-slate-700">{suggestion.summary}</span>
                      </div>
                    ) : followupText ? (
                      <span className="text-slate-600">{followupText}</span>
                    ) : (
                      <span className="text-slate-400">Nothing outstanding.</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(clients ?? []).length === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-6 text-center text-slate-500">
                  No clients yet.{" "}
                  <Link href="/clients/new" className="underline">
                    Add your first one.
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
