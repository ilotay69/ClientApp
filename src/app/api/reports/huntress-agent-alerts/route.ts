import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildHuntressAgentAlertsReport } from "@/lib/reports";
import { getHuntressSettings } from "@/lib/huntress-settings";

export const dynamic = "force-dynamic";

/** Every Huntress agent account-wide with a real health concern — no
 * check-in, missing EDR, unhealthy Defender/firewall — live from
 * Huntress. */
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
  const settings = await getHuntressSettings(admin);
  if (!settings) return new Response("Huntress isn't connected yet.", { status: 400 });

  let headers, rows;
  try {
    ({ headers, rows } = await buildHuntressAgentAlertsReport(settings));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load agent health.", { status: 500 });
  }

  return csvResponse("huntress-agent-alerts.csv", toCsv(headers, rows));
}
