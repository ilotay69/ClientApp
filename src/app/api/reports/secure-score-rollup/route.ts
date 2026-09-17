import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildSecureScoreRollupReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Secure Score across every client with an M365 tenant linked — a live
 * Graph call per client, isolated so one client's expired credentials
 * don't block the rest (see ClientLookupError in src/lib/m365-lookups.ts).
 * Per-client failures surface in the preview's warnings, not here. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildSecureScoreRollupReport(createAdminClient());
  return csvResponse("secure-score-rollup.csv", toCsv(headers, rows));
}
