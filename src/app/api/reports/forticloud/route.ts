import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildForticloudDevicesReport } from "@/lib/reports";
import type { ForticloudCredentials } from "@/lib/forticloud";

export const dynamic = "force-dynamic";

/** Live from every FortiCloud account on file, same as the FortiCloud
 * Devices lookup — not stored anywhere. */
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
  const { data: rows } = await admin.from("forticloud_accounts").select("label, api_user, api_password");
  if (!rows || rows.length === 0) {
    return new Response("No FortiCloud accounts configured yet — add one under Settings → Integrations.", {
      status: 400,
    });
  }
  const accounts = rows.map((r) => ({
    label: r.label,
    creds: { apiUser: r.api_user, apiPassword: r.api_password } satisfies ForticloudCredentials,
  }));

  let headers, csvRows;
  try {
    ({ headers, rows: csvRows } = await buildForticloudDevicesReport(accounts));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to load FortiCloud devices.", { status: 500 });
  }

  return csvResponse("forticloud-devices.csv", toCsv(headers, csvRows));
}
