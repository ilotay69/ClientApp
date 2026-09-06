import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { buildOpenTicketsReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Every open Autotask ticket across every client, from the last sync of
 * each — not a live re-fetch. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { headers, rows } = await buildOpenTicketsReport(supabase);
  return csvResponse("open-tickets.csv", toCsv(headers, rows));
}
