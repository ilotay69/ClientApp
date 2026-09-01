import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchOpenTicketsForCompany,
  fetchTicketPicklists,
  fetchContractServicesForCompany,
} from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export const dynamic = "force-dynamic";

/**
 * Syncs open Autotask tickets for every client with a mapped
 * autotask_company_id. Call this on a schedule (e.g. a Railway Cron Job)
 * with header `X-Cron-Secret: <CRON_SECRET>`, same secret as mail-sync.
 * Simple replace-on-sync: deletes and re-inserts each client's rows —
 * no diffing needed for a read-only cache table.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return NextResponse.json({ error: "Autotask isn't configured yet." }, { status: 400 });
  }

  const { data: clients } = await admin
    .from("clients")
    .select("id, autotask_company_id")
    .not("autotask_company_id", "is", null);

  // Status/priority/queue labels are tenant-wide, not per-company — resolve
  // once for the whole run rather than once per client.
  const labels = await fetchTicketPicklists(settings.credentials, settings.zoneUrl);

  const results = [];
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
        await admin.from("autotask_tickets").insert(
          tickets.map((t) => ({ ...t, client_id: client.id }))
        );
      }

      const contractServices = await fetchContractServicesForCompany(
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id as number
      );
      await admin.from("autotask_contract_services").delete().eq("client_id", client.id);
      if (contractServices.length > 0) {
        await admin.from("autotask_contract_services").insert(
          contractServices.map((cs) => ({ ...cs, client_id: client.id }))
        );
      }

      results.push({ clientId: client.id, tickets: tickets.length, contractServices: contractServices.length });
    } catch (err) {
      results.push({
        clientId: client.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
