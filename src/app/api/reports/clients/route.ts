import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";

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

  const { data: clients } = await supabase
    .from("clients")
    .select(
      "name, primary_contact_name, primary_contact_email, autotask_company_id, ninjaone_organization_id, m365_tenant_id"
    )
    .order("name");

  const csv = toCsv(
    ["Client", "Primary contact", "Primary contact email", "Autotask mapped", "NinjaOne mapped", "M365 mapped"],
    (clients ?? []).map((c: {
      name: string;
      primary_contact_name: string | null;
      primary_contact_email: string | null;
      autotask_company_id: number | null;
      ninjaone_organization_id: number | null;
      m365_tenant_id: string | null;
    }) => [
      c.name,
      c.primary_contact_name,
      c.primary_contact_email,
      c.autotask_company_id != null ? "Yes" : "No",
      c.ninjaone_organization_id != null ? "Yes" : "No",
      c.m365_tenant_id ? "Yes" : "No",
    ])
  );

  return csvResponse("client-roster.csv", csv);
}
