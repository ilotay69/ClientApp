import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ClientMappingTable, type ClientMappingRow } from "@/components/client-mapping-table";
import {
  searchNinjaOneOrganizationsAction,
  linkClientNinjaOneOrganization,
  unlinkClientNinjaOneOrganization,
  saveM365ClientCredentialsAction,
  testM365ClientConnectionAction,
  unlinkClientM365Tenant,
  searchHuntressOrganizationsAction,
  linkClientHuntressOrganization,
  unlinkClientHuntressOrganization,
} from "@/app/(dashboard)/clients/actions";

export const dynamic = "force-dynamic";

// Same gate as Settings -> Integrations, which this page moved out of —
// linking a client's NinjaOne org / M365 tenant / Huntress org is exactly
// the kind of integration wiring that permission already covers.
export default async function ClientMappingSettingsPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_integrations"))) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const [{ data: mappingClientRows }, { data: m365CredentialRows }] = await Promise.all([
    // Every client, not just Autotask-linked ones — a client with no
    // NinjaOne/365 mapping yet is precisely what this table exists to
    // surface, so filtering any of them out would hide the work.
    admin
      .from("clients")
      .select("id, name, ninjaone_organization_id, m365_tenant_id, huntress_organization_id")
      .order("name"),
    // m365_client_credentials is service-role only and keyed by client_id,
    // so credential presence can't come from the clients select above.
    // app_client_id only (never the secret) — the table just needs to show
    // which id is on file so someone can tell whether it's the right one.
    admin.from("m365_client_credentials").select("client_id, app_client_id"),
  ]);

  type MappingClientRow = {
    id: string;
    name: string;
    ninjaone_organization_id: number | null;
    m365_tenant_id: string | null;
    huntress_organization_id: number | null;
  };
  const m365AppClientIdByClientId = new Map<string, string | null>(
    ((m365CredentialRows ?? []) as { client_id: string; app_client_id: string | null }[]).map((r) => [
      r.client_id,
      r.app_client_id,
    ])
  );
  const clientMappingRows: ClientMappingRow[] = ((mappingClientRows ?? []) as MappingClientRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    ninjaoneOrganizationId: c.ninjaone_organization_id,
    m365TenantId: c.m365_tenant_id,
    hasM365Credentials: Boolean(m365AppClientIdByClientId.get(c.id)),
    m365AppClientId: m365AppClientIdByClientId.get(c.id) ?? null,
    huntressOrganizationId: c.huntress_organization_id,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Client Mapping</h1>
        <p className="mt-1 text-sm text-slate-500">
          Link each client&apos;s own NinjaOne organization, Microsoft 365 tenant, and Huntress
          organization — this is what every account-wide report and lookup uses to know which
          client a device, user, or alert belongs to.
        </p>
      </div>

      <ClientMappingTable
        rows={clientMappingRows}
        searchNinjaOneAction={searchNinjaOneOrganizationsAction}
        linkNinjaOneAction={linkClientNinjaOneOrganization}
        unlinkNinjaOneAction={unlinkClientNinjaOneOrganization}
        saveM365Action={saveM365ClientCredentialsAction}
        testM365Action={testM365ClientConnectionAction}
        unlinkM365Action={unlinkClientM365Tenant}
        searchHuntressAction={searchHuntressOrganizationsAction}
        linkHuntressAction={linkClientHuntressOrganization}
        unlinkHuntressAction={unlinkClientHuntressOrganization}
      />
    </div>
  );
}
