import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildResourceHoursReport } from "@/lib/reports";
import { getAutotaskSettings } from "@/lib/autotask-settings";

export const dynamic = "force-dynamic";

/** Per-resource hours today/yesterday/this week/this month, live from
 * Autotask. Moved over from the Lookups page's "Resource Hours" tab. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  // autotask_settings holds a service-role-only-readable credential row,
  // same posture as every other integration's own settings table — the
  // session client above can't read it, only the permission check needs it.
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return new Response("Autotask isn't connected yet.", { status: 400 });

  let headers, rows;
  try {
    ({ headers, rows } = await buildResourceHoursReport(settings.credentials, settings.zoneUrl));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load hours.", { status: 500 });
  }

  return csvResponse("resource-hours.csv", toCsv(headers, rows));
}
