import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildContractBlockHoursReport } from "@/lib/reports";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export const dynamic = "force-dynamic";

/** Prepaid/block hours remaining for every active Contract Block,
 * account-wide. Moved over from the Lookups page's "Block Hours" tab —
 * distinct from "Block of hrs usage" (single client, with an email
 * button), which already had its own report. */
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
  if (!settings?.zoneUrl) return new Response("Autotask isn't connected yet.", { status: 400 });

  let headers, rows;
  try {
    ({ headers, rows } = await buildContractBlockHoursReport(admin, settings.credentials, settings.zoneUrl));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load block hours.", { status: 500 });
  }

  return csvResponse("block-hours.csv", toCsv(headers, rows));
}
