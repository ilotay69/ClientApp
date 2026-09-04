import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchClientHoursSummary } from "@/lib/resource-hours";

export const dynamic = "force-dynamic";

/** Live from Autotask, same as the Hours page — today/yesterday/week/month
 * per client, not stored anywhere. */
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
  if (!settings?.zoneUrl) {
    return new Response("Autotask isn't connected yet — set it up under Settings → Integrations.", {
      status: 400,
    });
  }

  let rows;
  try {
    rows = await fetchClientHoursSummary(admin, settings.credentials, settings.zoneUrl);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load hours.", { status: 500 });
  }

  const csv = toCsv(
    ["Client", "Today", "Yesterday", "This week", "This month"],
    rows.map((r) => [r.clientName, r.today.toFixed(1), r.yesterday.toFixed(1), r.thisWeek.toFixed(1), r.thisMonth.toFixed(1)])
  );

  return csvResponse("hours-summary.csv", csv);
}
