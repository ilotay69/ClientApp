import {
  fetchTimeEntriesInRange,
  resolveResourceNames,
  resolveTicketCompanyIds,
  type AutotaskCredentials,
} from "@/lib/autotask";

/** Upserts every Autotask time entry logged on `dateStr` (YYYY-MM-DD) into
 * autotask_time_entries — accumulating history, never replaced, unlike
 * every other Autotask sync in this app (which are read-only caches of
 * Autotask's current state). Upserted by Autotask's own time entry id, so
 * re-running for a date already synced (a daily cron overlapping a manual
 * "Sync now") just updates rows in place rather than duplicating them.
 *
 * A time entry carries no client/company reference of its own — it's
 * attributed to a client via its ticket's companyID, resolved from
 * Autotask directly (not this app's own autotask_tickets cache, which
 * only ever holds OPEN tickets and would silently lose the link the
 * moment a ticket closes). An entry with no ticketID (task-based time) or
 * whose ticket's company isn't mapped to a client here gets client_id =
 * null rather than being dropped — still real history, just unattributed. */
export async function syncTimeEntriesForDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  dateStr: string
): Promise<{ synced: number }> {
  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, dateStr, dateStr);
  if (entries.length === 0) return { synced: 0 };

  const [resourceNames, ticketCompanyIds] = await Promise.all([
    resolveResourceNames(
      creds,
      zoneUrl,
      entries.map((e) => e.resourceID)
    ),
    resolveTicketCompanyIds(
      creds,
      zoneUrl,
      entries.map((e) => e.ticketID).filter((id): id is number => id != null)
    ),
  ]);

  const companyIds = [...new Set([...ticketCompanyIds.values()])];
  const { data: clients } = await admin
    .from("clients")
    .select("id, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientIdByCompanyId = new Map(
    (clients ?? []).map((c: { id: string; autotask_company_id: number }) => [
      c.autotask_company_id,
      c.id,
    ])
  );

  const rows = entries.map((e) => {
    const companyId = e.ticketID != null ? ticketCompanyIds.get(e.ticketID) : undefined;
    const clientId = companyId != null ? clientIdByCompanyId.get(companyId) : undefined;
    return {
      id: e.id,
      client_id: clientId ?? null,
      resource_id: e.resourceID,
      resource_name: resourceNames.get(e.resourceID) ?? `Resource ${e.resourceID}`,
      ticket_id: e.ticketID,
      task_id: e.taskID,
      hours_worked: e.hoursWorked,
      date_worked: e.dateWorked.slice(0, 10),
      summary_notes: e.summaryNotes,
    };
  });

  const { error } = await admin.from("autotask_time_entries").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  return { synced: rows.length };
}
