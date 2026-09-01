import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchDevicesForOrganization } from "@/lib/ninjaone";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";

export const dynamic = "force-dynamic";

/**
 * Syncs devices for every client with a mapped ninjaone_organization_id.
 * Call this on a schedule (e.g. a Railway Cron Job) with header
 * `X-Cron-Secret: <CRON_SECRET>`, same secret as mail-sync/autotask-sync.
 * Simple replace-on-sync: deletes and re-inserts each client's rows.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return NextResponse.json({ error: "NinjaOne isn't configured yet." }, { status: 400 });
  }

  const { data: clients } = await admin
    .from("clients")
    .select("id, ninjaone_organization_id")
    .not("ninjaone_organization_id", "is", null);

  // One token for the whole run, refreshed once if needed — not per client.
  const token = await getValidNinjaOneToken(admin, settings);

  const results = [];
  for (const client of clients ?? []) {
    try {
      const devices = await fetchDevicesForOrganization(
        settings.credentials,
        token,
        client.ninjaone_organization_id as number
      );

      await admin.from("ninjaone_devices").delete().eq("client_id", client.id);
      if (devices.length > 0) {
        await admin.from("ninjaone_devices").insert(
          devices.map((d) => ({ ...d, client_id: client.id }))
        );
      }

      results.push({ clientId: client.id, devices: devices.length });
    } catch (err) {
      results.push({
        clientId: client.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
