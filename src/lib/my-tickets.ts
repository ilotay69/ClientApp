import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchActiveResources, fetchMyTickets } from "@/lib/autotask";

type Admin = ReturnType<typeof createAdminClient>;

export type MyOpenTicketRow = {
  id: number;
  ticketNumber: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  queueName: string | null;
  dueDate: string | null;
  openedAt: string | null;
  lastActivityAt: string | null;
  clientName: string | null;
};

export type MyOpenTicketsResult = {
  tickets: MyOpenTicketRow[];
  /** The Autotask resource name matched against fullName, or null when
   * nothing matched — surfaced so the UI can tell "matched, but genuinely
   * has zero open tickets right now" apart from "your profile name didn't
   * match any active Autotask resource at all", which otherwise look
   * identical (an empty list) and are very different problems to fix. */
  matchedResourceName: string | null;
};

/** Every open ticket where this person is either the Primary or a
 * Secondary Resource — live from Autotask, not the local autotask_tickets
 * cache (which only ever recorded the primary resource, and only as
 * fresh as the last account-wide sync).
 *
 * Matched by name, not id: Autotask resources aren't linked to this app's
 * profiles anywhere (no autotask_resource_id column exists), so this
 * assumes a staff member's Autotask resource name matches their full_name
 * here exactly (case-insensitively) — true in practice since resources are
 * named after the actual technician, but a renamed profile or a resource
 * set up under a different name (e.g. a nickname) won't match. */
export async function fetchMyOpenAutotaskTickets(
  admin: Admin,
  fullName: string | null
): Promise<MyOpenTicketsResult> {
  if (!fullName) return { tickets: [], matchedResourceName: null };

  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return { tickets: [], matchedResourceName: null };

  const resources = await fetchActiveResources(settings.credentials, settings.zoneUrl);
  const me = resources.find((r) => r.name.toLowerCase() === fullName.toLowerCase());
  if (!me) return { tickets: [], matchedResourceName: null };

  const tickets = await fetchMyTickets(settings.credentials, settings.zoneUrl, me.id);
  if (tickets.length === 0) return { tickets: [], matchedResourceName: me.name };

  const companyIds = [...new Set(tickets.map((t) => t.company_id))];
  const { data: clients } = await admin
    .from("clients")
    .select("name, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientNameByCompanyId = new Map<number, string>(
    (clients ?? []).map((c: { name: string; autotask_company_id: number }): [number, string] => [
      c.autotask_company_id,
      c.name,
    ])
  );

  return {
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticket_number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      queueName: t.queue_name,
      dueDate: t.due_date,
      openedAt: t.opened_at,
      lastActivityAt: t.last_activity_at,
      clientName: clientNameByCompanyId.get(t.company_id) ?? null,
    })),
    matchedResourceName: me.name,
  };
}
