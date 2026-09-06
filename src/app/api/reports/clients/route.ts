import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildClientRosterReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Client roster — name, primary contact, and which integrations each
 * client is mapped to. Useful for spotting clients missing a mapping. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildClientRosterReport(supabase);
  return csvResponse("client-roster.csv", toCsv(headers, rows));
}
