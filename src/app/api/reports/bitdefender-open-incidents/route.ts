import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { getBitdefenderSettings } from "@/lib/bitdefender-settings";
import { buildBitdefenderOpenIncidentsReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Every EDR/XDR incident account-wide still open or in progress, same as
 * the Bitdefender Incidents lookup — not stored anywhere. */
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
  const settings = await getBitdefenderSettings(admin);
  if (!settings) {
    return new Response("Bitdefender GravityZone isn't connected yet — set it up under Settings → Integrations.", {
      status: 400,
    });
  }

  let headers, rows;
  try {
    ({ headers, rows } = await buildBitdefenderOpenIncidentsReport(settings));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load Bitdefender incidents.", {
      status: 500,
    });
  }

  return csvResponse("bitdefender-open-incidents.csv", toCsv(headers, rows));
}
