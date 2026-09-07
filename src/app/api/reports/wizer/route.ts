import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { getWizerSettings } from "@/lib/wizer-settings";
import { buildWizerMetricsReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Live across every Wizer customer company, same as the Wizer Training &
 * Phishing lookup — not stored anywhere. */
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
  const settings = await getWizerSettings(admin);
  if (!settings) {
    return new Response("Wizer isn't connected yet — set it up under Settings → Integrations.", { status: 400 });
  }

  let headers, csvRows;
  try {
    ({ headers, rows: csvRows } = await buildWizerMetricsReport(settings));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load Wizer metrics.", { status: 500 });
  }

  return csvResponse("wizer-training-metrics.csv", toCsv(headers, csvRows));
}
