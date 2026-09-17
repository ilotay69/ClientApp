import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildAntivirusAlertsReport } from "@/lib/reports";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";

export const dynamic = "force-dynamic";

/** Every device account-wide whose antivirus isn't actively protecting it
 * — a live NinjaOne call, unlike the other device reports (antivirus/patch
 * status isn't synced into ninjaone_devices). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) return new Response("NinjaOne isn't connected yet.", { status: 400 });

  let headers, rows;
  try {
    const token = await getValidNinjaOneToken(admin, settings);
    ({ headers, rows } = await buildAntivirusAlertsReport(admin, settings.credentials, token));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load antivirus status.", { status: 500 });
  }

  return csvResponse("antivirus-alerts.csv", toCsv(headers, rows));
}
