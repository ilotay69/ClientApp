import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type CompanyInfo = {
  companyName: string;
  address: string | null;
};

/** CG's own name/address for the "from" side of a client-facing document
 * (the public proposal page, its signed-copy PDF). Editable under
 * Settings -> Integrations (migration 140) rather than hardcoded. Always
 * returns a usable companyName even if the settings row is somehow
 * missing (shouldn't happen - it's seeded by the migration - but a
 * client-facing document should never render a blank "from"). */
export async function getCompanyInfo(admin: Admin = createAdminClient()): Promise<CompanyInfo> {
  const { data } = await admin.from("company_info").select("company_name, address").eq("id", true).maybeSingle();
  return {
    companyName: data?.company_name || "CG Technologies",
    address: data?.address ?? null,
  };
}
