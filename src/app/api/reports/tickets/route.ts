import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Every open Autotask ticket across every client, from the last sync of
 * each — not a live re-fetch. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { data: tickets } = await supabase
    .from("autotask_tickets")
    .select(
      "ticket_number, title, status, priority, queue_name, assigned_resource_name, due_date, last_activity_at, clients(name)"
    )
    .order("last_activity_at", { ascending: true });

  type Row = {
    ticket_number: string | null;
    title: string;
    status: string | null;
    priority: string | null;
    queue_name: string | null;
    assigned_resource_name: string | null;
    due_date: string | null;
    last_activity_at: string | null;
    clients: { name: string } | null;
  };

  const csv = toCsv(
    ["Client", "Ticket #", "Title", "Status", "Priority", "Queue", "Assigned to", "Due date", "Last activity"],
    ((tickets ?? []) as unknown as Row[]).map((t) => [
      t.clients?.name ?? "Unmapped",
      t.ticket_number,
      t.title,
      t.status,
      t.priority,
      t.queue_name,
      t.assigned_resource_name,
      t.due_date ? formatDate(t.due_date) : null,
      t.last_activity_at ? formatDate(t.last_activity_at) : null,
    ])
  );

  return csvResponse("open-tickets.csv", csv);
}
