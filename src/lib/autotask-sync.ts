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
  fetchPrimaryContactForCompany,
} from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export type AutotaskSyncResult =
  | { clientId: string; tickets: number; contractServices: number; projectTickets: number }
  | { clientId: string; error: string };

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

      const projectTickets = await fetchProjectSlaTicketsForCompany(
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id as number,
        labels
      );
      await admin
        .from("projects")
        .delete()
        .eq("client_id", client.id)
        .not("source_autotask_ticket_id", "is", null);
      if (projectTickets.length > 0) {
        await admin
          .from("projects")
          .insert(projectTickets.map((p) => ({ ...p, client_id: client.id })));
      }

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
        projectTickets: projectTickets.length,
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
