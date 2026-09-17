import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildMissingPatchesReport } from "@/lib/reports";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";

export const dynamic = "force-dynamic";

/** Every device account-wide with a missing patch — a live NinjaOne call,
 * same as antivirus status. */
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
    ({ headers, rows } = await buildMissingPatchesReport(admin, settings.credentials, token));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load patch status.", { status: 500 });
  }

  return csvResponse("missing-patches.csv", toCsv(headers, rows));
}
