import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildYesterdayTimeEntriesReport } from "@/lib/reports";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export const dynamic = "force-dynamic";

/** Every time entry from the last business day, live from Autotask.
 * Moved over from the Lookups page's "Yesterday's Entries" tab. */
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
    ({ headers, rows } = await buildYesterdayTimeEntriesReport(admin, settings.credentials, settings.zoneUrl));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load time entries.", { status: 500 });
  }

  return csvResponse("yesterday-time-entries.csv", toCsv(headers, rows));
}
