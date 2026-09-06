import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { buildHoursSummaryReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Live from Autotask, same as the Hours page — today/yesterday/week/month
 * per client, not stored anywhere. */
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
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return new Response("Autotask isn't connected yet — set it up under Settings → Integrations.", {
      status: 400,
    });
  }

  let headers, rows;
  try {
    ({ headers, rows } = await buildHoursSummaryReport(admin, settings.credentials, settings.zoneUrl));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load hours.", { status: 500 });
  }

  return csvResponse("hours-summary.csv", toCsv(headers, rows));
}
