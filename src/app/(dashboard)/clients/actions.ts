"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { generateSuggestions } from "@/lib/suggestions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import {
  searchAutotaskCompanies,
  fetchOpenTicketsForCompany,
  fetchTicketPicklists,
  fetchContractServicesForCompany,
  fetchTicketNotes,
  fetchTicketTimeEntries,
  type AutotaskCompany,
  type AutotaskTicketNote,
  type AutotaskTimeEntry,
} from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  searchNinjaOneOrganizations,
  fetchDevicesForOrganization,
  type NinjaOneOrganization,
} from "@/lib/ninjaone";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";
import {
  listDelegatedAdminCustomers,
  fetchLicenseSummaryForTenant,
  fetchSecureScoreGapsForTenant,
  type M365Customer,
} from "@/lib/m365-partner";
import { getM365PartnerSettings, getCustomerScopedToken } from "@/lib/m365-partner-settings";

export type FormState = { error: string | null };

export async function createClientRecord(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      primary_contact_name: emptyToNull(formData.get("primary_contact_name")),
      primary_contact_email: emptyToNull(formData.get("primary_contact_email")),
      primary_contact_phone: emptyToNull(formData.get("primary_contact_phone")),
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientRecord(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      primary_contact_name: emptyToNull(formData.get("primary_contact_name")),
      primary_contact_email: emptyToNull(formData.get("primary_contact_email")),
      primary_contact_phone: emptyToNull(formData.get("primary_contact_phone")),
    })
    .eq("id", clientId);

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { error: null };
}

export async function deleteClientRecord(clientId: string) {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").delete().eq("id", clientId);
  revalidatePath("/clients");
  redirect("/clients");
}

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function addClientContact(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Contact name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    name,
    email: emptyToNull(formData.get("email")),
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function removeClientContact(clientId: string, contactId: string) {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("client_contacts").delete().eq("id", contactId);
  revalidatePath(`/clients/${clientId}`);
}

/** Logging a Note/Call/Meeting is open to any signed-in user — matches how
 * touchpoints/tasks work today; only editing the client record itself and
 * managing its contact list require manage_clients. */
export async function logClientInteraction(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Enter a note or summary." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("client_interactions").insert({
    client_id: clientId,
    contact_id: emptyToNull(formData.get("contact_id")),
    type: String(formData.get("type") ?? "note"),
    subject: emptyToNull(formData.get("subject")),
    body,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

/** Name search against Autotask Companies, for the client-mapping UI on the
 * Tickets tab. Returns an error string instead of throwing so the client
 * component can render it inline. */
export async function searchAutotaskCompaniesAction(
  query: string
): Promise<{ companies: AutotaskCompany[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!query.trim()) return { companies: [] };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const companies = await searchAutotaskCompanies(settings.credentials, settings.zoneUrl, query);
    return { companies };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Autotask search failed." };
  }
}

export async function linkClientAutotaskCompany(
  clientId: string,
  companyId: number
): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ autotask_company_id: companyId }).eq("id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

export async function unlinkClientAutotaskCompany(clientId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ autotask_company_id: null }).eq("id", clientId);
  await supabase.from("autotask_tickets").delete().eq("client_id", clientId);
  await supabase.from("autotask_contract_services").delete().eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

/** On-demand sync for a single mapped client — tickets and contracted
 * services — same replace-on-sync logic as the /api/autotask-sync cron
 * job, scoped to one client so it's fast enough to run from a button
 * without waiting on the cron job. */
export async function syncClientAutotaskData(clientId: string): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("autotask_company_id")
    .eq("id", clientId)
    .single();
  if (!client?.autotask_company_id) {
    return { error: "This client isn't linked to an Autotask company yet." };
  }

  try {
    const labels = await fetchTicketPicklists(settings.credentials, settings.zoneUrl);
    const tickets = await fetchOpenTicketsForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id,
      labels
    );
    await admin.from("autotask_tickets").delete().eq("client_id", clientId);
    if (tickets.length > 0) {
      await admin
        .from("autotask_tickets")
        .insert(tickets.map((t) => ({ ...t, client_id: clientId })));
    }

    const contractServices = await fetchContractServicesForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    await admin.from("autotask_contract_services").delete().eq("client_id", clientId);
    if (contractServices.length > 0) {
      await admin
        .from("autotask_contract_services")
        .insert(contractServices.map((cs) => ({ ...cs, client_id: clientId })));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

/** Live detail for one ticket — notes and time entries ("charges"), fetched
 * only when a ticket row is expanded, never persisted. Bulk-fetching this
 * for every open ticket on every sync would burn through Autotask's shared
 * rate limit for data most tickets never need. */
export async function getAutotaskTicketDetailAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for
  // signature symmetry with other actions bound to a client id
  _clientId: string,
  ticketId: number
): Promise<{ notes: AutotaskTicketNote[]; timeEntries: AutotaskTimeEntry[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    // Sequential, not Promise.all — Autotask enforces a low concurrent-
    // thread cap per API user (as few as 3), shared across everything that
    // account is doing at once.
    const notes = await fetchTicketNotes(settings.credentials, settings.zoneUrl, ticketId);
    const timeEntries = await fetchTicketTimeEntries(settings.credentials, settings.zoneUrl, ticketId);
    return { notes, timeEntries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load ticket detail." };
  }
}

export type RefreshClientInsightsState = { error: string | null; summary: string | null };

/** Per-client version of the dashboard's "Refresh insights" — scoped to just
 * this client via generateSuggestions' onlyClientId, so it's fast enough to
 * run from a single client's page and always attempts it (the batch job's
 * recent-activity gate doesn't apply to an explicit, single-client ask). */
export async function refreshClientInsightsAction(
  clientId: string,
  _prevState: RefreshClientInsightsState,
  _formData: FormData
): Promise<RefreshClientInsightsState> {
  const admin = createAdminClient();

  if (!(await getActiveAiSettings(admin))) {
    return {
      error: "AI insights aren't set up yet — configure a provider under Settings → Integrations.",
      summary: null,
    };
  }

  try {
    const result = await generateSuggestions(admin, { onlyClientId: clientId });
    revalidatePath(`/clients/${clientId}`);
    return {
      error: null,
      summary:
        result.created > 0
          ? `Found ${result.created} new insight${result.created === 1 ? "" : "s"}.`
          : "No new insights — nothing new or notable right now.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Refresh failed.", summary: null };
  }
}

export async function searchNinjaOneOrganizationsAction(
  query: string
): Promise<{ organizations: NinjaOneOrganization[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!query.trim()) return { organizations: [] };

  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const token = await getValidNinjaOneToken(admin, settings);
    const organizations = await searchNinjaOneOrganizations(settings.credentials, token, query);
    return { organizations };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "NinjaOne search failed." };
  }
}

export async function linkClientNinjaOneOrganization(
  clientId: string,
  organizationId: number
): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase
    .from("clients")
    .update({ ninjaone_organization_id: organizationId })
    .eq("id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

export async function unlinkClientNinjaOneOrganization(clientId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ ninjaone_organization_id: null }).eq("id", clientId);
  await supabase.from("ninjaone_devices").delete().eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

/** On-demand device sync for a single mapped client — same replace-on-
 * sync logic as the /api/ninjaone-sync cron job, scoped to one client. */
export async function syncClientNinjaOneDevices(clientId: string): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("ninjaone_organization_id")
    .eq("id", clientId)
    .single();
  if (!client?.ninjaone_organization_id) {
    return { error: "This client isn't linked to a NinjaOne organization yet." };
  }

  try {
    const token = await getValidNinjaOneToken(admin, settings);
    const devices = await fetchDevicesForOrganization(
      settings.credentials,
      token,
      client.ninjaone_organization_id
    );
    await admin.from("ninjaone_devices").delete().eq("client_id", clientId);
    if (devices.length > 0) {
      await admin
        .from("ninjaone_devices")
        .insert(devices.map((d) => ({ ...d, client_id: clientId })));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function searchM365CustomersAction(
  query: string
): Promise<{ customers: M365Customer[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!query.trim()) return { customers: [] };

  const admin = createAdminClient();
  const settings = await getM365PartnerSettings(admin);
  if (!settings?.refreshToken) {
    return { error: "Microsoft 365 isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    // Customer enumeration is a partner-tenant call, not a per-customer one.
    const partnerToken = await getCustomerScopedToken(admin, settings, settings.credentials.partnerTenantId);
    const customers = await listDelegatedAdminCustomers(partnerToken, query);
    return { customers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Microsoft 365 search failed." };
  }
}

export async function linkClientM365Tenant(clientId: string, tenantId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ m365_tenant_id: tenantId }).eq("id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

export async function unlinkClientM365Tenant(clientId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ m365_tenant_id: null }).eq("id", clientId);
  await supabase.from("m365_license_summary").delete().eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

/** On-demand sync for a single mapped client — licenses and Secure Score
 * gaps together, one click. Unlike the Autotask/NinjaOne sync actions,
 * this exchanges a rotating refresh token — safe here since it's exactly
 * one exchange for exactly one tenant, but the cron route (which loops
 * many clients) must do these sequentially. */
export async function syncClientM365Data(clientId: string): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getM365PartnerSettings(admin);
  if (!settings?.refreshToken) {
    return { error: "Microsoft 365 isn't connected yet — set it up under Settings → Integrations." };
  }

  const { data: client } = await admin
    .from("clients")
    .select("m365_tenant_id")
    .eq("id", clientId)
    .single();
  if (!client?.m365_tenant_id) {
    return { error: "This client isn't linked to a Microsoft 365 tenant yet." };
  }

  try {
    const customerToken = await getCustomerScopedToken(admin, settings, client.m365_tenant_id);

    const licenses = await fetchLicenseSummaryForTenant(customerToken);
    await admin.from("m365_license_summary").delete().eq("client_id", clientId);
    if (licenses.length > 0) {
      await admin
        .from("m365_license_summary")
        .insert(licenses.map((l) => ({ ...l, client_id: clientId })));
    }

    const { summary, gaps } = await fetchSecureScoreGapsForTenant(customerToken);
    await admin.from("m365_secure_score").upsert({ ...summary, client_id: clientId });
    await admin.from("m365_secure_score_gaps").delete().eq("client_id", clientId);
    if (gaps.length > 0) {
      await admin
        .from("m365_secure_score_gaps")
        .insert(gaps.map((g) => ({ ...g, client_id: clientId })));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}
