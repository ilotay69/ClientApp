import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildDeviceInventoryReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Full device inventory across every client, from the last NinjaOne sync
 * of each — not a live re-fetch, so it's only as current as each client's
 * last "Sync NinjaOne" click. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildDeviceInventoryReport(supabase);
  return csvResponse("device-inventory.csv", toCsv(headers, rows));
}
