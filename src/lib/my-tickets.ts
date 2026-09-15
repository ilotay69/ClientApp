// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type MyOpenTicketRow = {
  id: string;
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

/** Every ticket in autotask_tickets currently assigned to this exact
 * full_name — that table only ever holds currently-open tickets (its sync
 * deletes and re-inserts a client's open set each run, see
 * src/lib/autotask-sync.ts), so there's no separate "open" filter needed
 * here.
 *
 * Matched by name, not id: Autotask resources aren't linked to this app's
 * profiles anywhere (no autotask_resource_id column exists), so this
 * assumes a staff member's Autotask resource name matches their full_name
 * here exactly (case-insensitively) — true in practice since resources are
 * named after the actual technician, but a renamed profile or a resource
 * set up under a different name (e.g. a nickname) won't match. */
export async function fetchMyOpenAutotaskTickets(
  supabase: AnyClient,
  fullName: string | null
): Promise<MyOpenTicketRow[]> {
  if (!fullName) return [];

  const { data } = await supabase
    .from("autotask_tickets")
    .select("id, ticket_number, title, status, priority, queue_name, due_date, opened_at, last_activity_at, clients(name)")
    .ilike("assigned_resource_name", fullName)
    .order("due_date", { ascending: true, nullsFirst: false });

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as {
      id: string;
      ticket_number: string | null;
      title: string;
      status: string | null;
      priority: string | null;
      queue_name: string | null;
      due_date: string | null;
      opened_at: string | null;
      last_activity_at: string | null;
      clients: { name: string } | { name: string }[] | null;
    };
    const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    return {
      id: r.id,
      ticketNumber: r.ticket_number,
      title: r.title,
      status: r.status,
      priority: r.priority,
      queueName: r.queue_name,
      dueDate: r.due_date,
      openedAt: r.opened_at,
      lastActivityAt: r.last_activity_at,
      clientName: client?.name ?? null,
    };
  });
}
