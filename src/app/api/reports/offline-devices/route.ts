import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildOfflineDevicesReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Every offline device across every client, from the last NinjaOne sync
 * — a plain DB read, no live NinjaOne call needed. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildOfflineDevicesReport(createAdminClient());
  return csvResponse("offline-devices.csv", toCsv(headers, rows));
}
