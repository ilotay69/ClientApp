import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildLicenseUtilizationRollupReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** License assigned/available counts across every client with an M365
 * tenant linked — live per-client Graph calls, isolated failures. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildLicenseUtilizationRollupReport(createAdminClient());
  return csvResponse("license-utilization.csv", toCsv(headers, rows));
}
