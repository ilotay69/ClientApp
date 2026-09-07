import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { getBitdefenderSettings } from "@/lib/bitdefender-settings";
import { buildBitdefenderEndpointsReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Live from GravityZone across every company visible to the partner key,
 * same as the Bitdefender Endpoints lookup — not stored anywhere. */
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

  let headers, csvRows;
  try {
    ({ headers, rows: csvRows } = await buildBitdefenderEndpointsReport(settings));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load Bitdefender endpoints.", {
      status: 500,
    });
  }

  return csvResponse("bitdefender-endpoints.csv", toCsv(headers, csvRows));
}
