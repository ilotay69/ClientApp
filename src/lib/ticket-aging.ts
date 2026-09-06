import { fetchAllOpenTickets, fetchTicketPicklists, type AutotaskCredentials } from "@/lib/autotask";

export type AgingTicketRow = {
  id: number;
  title: string;
  clientId: string | null;
  clientName: string;
  queueName: string | null;
  assignedResourceName: string | null;
  daysOpen: number;
  dueDate: string | null;
  isOverdue: boolean;
};

/** Every open ticket account-wide, with age and overdue status computed —
 * for spotting tickets that have sat too long or blown past their due date,
 * regardless of which client they belong to. Sorted overdue-first, then by
 * days open descending, so the ones needing attention surface first. */
export async function fetchAgingOpenTickets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<AgingTicketRow[]> {
  const labels = await fetchTicketPicklists(creds, zoneUrl);
  const tickets = await fetchAllOpenTickets(creds, zoneUrl, labels);
  if (tickets.length === 0) return [];

  const companyIds = [...new Set(tickets.map((t) => t.companyID))];
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientByCompanyId = new Map<number, { id: string; name: string }>(
    (clients ?? []).map(
      (c: { id: string; name: string; autotask_company_id: number }): [number, { id: string; name: string }] => [
        c.autotask_company_id,
        { id: c.id, name: c.name },
      ]
    )
  );

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const rows: AgingTicketRow[] = tickets.map((t) => {
    const client = clientByCompanyId.get(t.companyID);
    const createdDay = t.createdAt ? t.createdAt.slice(0, 10) : todayStr;
    const daysOpen = Math.max(
      0,
      Math.round((now.getTime() - new Date(createdDay).getTime()) / (1000 * 60 * 60 * 24))
    );
    const dueDay = t.dueDate ? t.dueDate.slice(0, 10) : null;
    return {
      id: t.id,
      title: t.title,
      clientId: client?.id ?? null,
      clientName: client?.name ?? "Unknown client",
      queueName: t.queueName,
      assignedResourceName: t.assignedResourceName,
      daysOpen,
      dueDate: t.dueDate,
      isOverdue: dueDay != null && dueDay < todayStr,
    };
  });

  return rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return b.daysOpen - a.daysOpen;
  });
}
