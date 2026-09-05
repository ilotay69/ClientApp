// Syncs Autotask tickets, contract services, and Project-SLA-derived
// projects for every client with a mapped autotask_company_id. Shared by
// the scheduled cron route (/api/autotask-sync) and the manual "Sync
// Autotask" button on the Projects page, so both run the exact same
// logic — no risk of the button doing something subtly different from
// what the nightly job does.
import {
  fetchOpenTicketsForCompany,
  fetchTicketPicklists,
  fetchContractServicesForCompany,
  fetchProjectSlaTicketsForCompany,
  fetchTicketTimeEntries,
  fetchPrimaryContactForCompany,
  type AutotaskCredentials,
  type PicklistLabelMaps,
} from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export type AutotaskSyncResult =
  | { clientId: string; tickets: number; contractServices: number; projectTickets: number }
  | { clientId: string; error: string };

/** Project-SLA tickets become this client's Projects — update-in-place
 * keyed on source_autotask_ticket_id (unique), not delete+insert: a fresh
 * insert would regenerate each project's id every sync, orphaning its
 * tasks/notes/documents and resetting quoted_hours. Shared by the cron
 * route, the Projects page's bulk sync, and the per-client "Sync Autotask"
 * button, so all three run identical logic.
 *
 * Also sums each ticket's own time entries into actual_hours — a single
 * derived number per project, refreshed each sync. This is not the same
 * as the account-wide time-entry table dropped in
 * 026_drop_autotask_time_entries.sql (that stored every entry for pattern
 * analysis); this keeps nothing but one running total per project. */
export async function syncProjectSlaProjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  clientId: string,
  companyId: number,
  labels: PicklistLabelMaps
): Promise<number> {
  const projectTickets = await fetchProjectSlaTicketsForCompany(creds, zoneUrl, companyId, labels);

  // Sequential, not Promise.all — Autotask rate-limits concurrent requests
  // (same reasoning as getAutotaskTicketDetailAction's sequential fetches).
  const enriched = [];
  for (const p of projectTickets) {
    let actualHours: number | null = null;
    try {
      const entries = await fetchTicketTimeEntries(creds, zoneUrl, p.source_autotask_ticket_id);
      actualHours = entries.reduce((sum, e) => sum + (e.hoursWorked ?? 0), 0);
    } catch (err) {
      console.error(
        `Failed to fetch time entries for ticket ${p.source_autotask_ticket_id}`,
        err
      );
    }
    enriched.push({
      ...p,
      actual_hours: actualHours,
      hours_synced_at: new Date().toISOString(),
    });
  }

  const currentTicketIds = enriched.map((p) => p.source_autotask_ticket_id);
  let removeQuery = admin
    .from("projects")
    .delete()
    .eq("client_id", clientId)
    .not("source_autotask_ticket_id", "is", null);
  if (currentTicketIds.length > 0) {
    removeQuery = removeQuery.not(
      "source_autotask_ticket_id",
      "in",
      `(${currentTicketIds.join(",")})`
    );
  }
  await removeQuery;

  if (enriched.length > 0) {
    await admin
      .from("projects")
      .upsert(
        enriched.map((p) => ({ ...p, client_id: clientId })),
        { onConflict: "source_autotask_ticket_id" }
      );
  }

  return enriched.length;
}

export async function syncAllAutotaskClients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<{ synced: number; results: AutotaskSyncResult[] } | { error: string }> {
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't configured yet." };
  }

  const { data: clients } = await admin
    .from("clients")
    .select("id, autotask_company_id")
    .not("autotask_company_id", "is", null);

  // Status/priority/queue/SLA labels are tenant-wide, not per-company —
  // resolve once for the whole run rather than once per client.
  const labels = await fetchTicketPicklists(settings.credentials, settings.zoneUrl);

  const results: AutotaskSyncResult[] = [];
  for (const client of clients ?? []) {
    try {
      const tickets = await fetchOpenTicketsForCompany(
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id as number,
        labels
      );
      await admin.from("autotask_tickets").delete().eq("client_id", client.id);
      if (tickets.length > 0) {
        await admin
          .from("autotask_tickets")
          .insert(tickets.map((t) => ({ ...t, client_id: client.id })));
      }

      const contractServices = await fetchContractServicesForCompany(
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id as number
      );
      await admin.from("autotask_contract_services").delete().eq("client_id", client.id);
      if (contractServices.length > 0) {
        await admin
          .from("autotask_contract_services")
          .insert(contractServices.map((cs) => ({ ...cs, client_id: client.id })));
      }

      const projectCount = await syncProjectSlaProjects(
        admin,
        settings.credentials,
        settings.zoneUrl,
        client.id,
        client.autotask_company_id as number,
        labels
      );

      const primaryContact = await fetchPrimaryContactForCompany(
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id as number
      );
      await admin
        .from("clients")
        .update({
          primary_contact_name: primaryContact?.name ?? null,
          primary_contact_email: primaryContact?.email ?? null,
        })
        .eq("id", client.id);

      results.push({
        clientId: client.id,
        tickets: tickets.length,
        contractServices: contractServices.length,
        projectTickets: projectCount,
      });
    } catch (err) {
      results.push({
        clientId: client.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { synced: results.length, results };
}
