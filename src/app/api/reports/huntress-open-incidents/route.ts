import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildHuntressOpenIncidentsReport } from "@/lib/reports";
import { getHuntressSettings } from "@/lib/huntress-settings";

export const dynamic = "force-dynamic";

/** Every Huntress incident report account-wide still actively open (sent
 * or auto-remediating), critical severity first — live from Huntress. */
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
    ({ headers, rows } = await buildHuntressOpenIncidentsReport(settings));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load open incidents.", { status: 500 });
  }

  return csvResponse("huntress-open-incidents.csv", toCsv(headers, rows));
}
