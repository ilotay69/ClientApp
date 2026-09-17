import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildPrivilegedRolesRollupReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Every privileged Entra role assignment account-wide — live per-client
 * Graph calls, isolated failures. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildPrivilegedRolesRollupReport(createAdminClient());
  return csvResponse("privileged-roles.csv", toCsv(headers, rows));
}
