"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { generateSuggestions } from "@/lib/suggestions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import {
  searchAutotaskCompanies,
  fetchActiveAutotaskCompanies,
  fetchOpenTicketsForCompany,
  fetchTicketPicklists,
  fetchContractServicesForCompany,
  fetchProjectSlaTicketsForCompany,
  fetchTicketNotes,
  fetchTicketTimeEntries,
  fetchContactsForCompany,
  fetchPrimaryContactForCompany,
  fetchQuotesForCompany,
  buildAutotaskQuoteUrl,
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
  fetchLicenseSummaryForTenant,
  fetchSecureScoreGapsForTenant,
  testM365ClientConnection,
  type M365ClientCredentials,
} from "@/lib/m365-partner";
import { getM365ClientSettings, getValidM365Token } from "@/lib/m365-client-credentials";
import { generateTicketInsights, type TicketInsight } from "@/lib/ticket-insights";

export type FormState = { error: string | null };

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

export async function removeClientContact(clientId: string, contactId: string) {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("client_contacts").delete().eq("id", contactId);
  revalidatePath(`/clients/${clientId}`);
}

/** Lists this client's Autotask contacts that aren't already in their
 * Contacts list here, for the "Add from Autotask" picker — deduped by
 * name+email against what's already saved, so re-opening the picker after
 * importing some doesn't show them again. */
export async function fetchAutotaskContactsForClient(
  clientId: string
): Promise<{ contacts: { id: number; name: string; email: string | null }[] } | { error: string }> {
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

  const { data: existing } = await admin
    .from("client_contacts")
    .select("name, email")
    .eq("client_id", clientId);
  const existingKeys = new Set(
    (existing ?? []).map(
      (c: { name: string; email: string | null }) => `${c.name.toLowerCase()}|${c.email?.toLowerCase() ?? ""}`
    )
  );

  try {
    const contacts = await fetchContactsForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    const newContacts = contacts.filter(
      (c) => !existingKeys.has(`${c.name.toLowerCase()}|${c.email?.toLowerCase() ?? ""}`)
    );
    return { contacts: newContacts.map((c) => ({ id: c.id, name: c.name, email: c.email })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load Autotask contacts." };
  }
}

/** Bulk-inserts a set of contacts picked from the Autotask picker above —
 * one insert for however many were checked, not one round-trip per
 * contact. */
export async function addClientContactsFromAutotask(
  clientId: string,
  contacts: { name: string; email: string | null }[]
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }
  if (contacts.length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_contacts")
    .insert(contacts.map((c) => ({ client_id: clientId, name: c.name, email: c.email })));

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

/** Logging a Note/Call/Meeting/Check-in is open to any signed-in user —
 * matches how touchpoints/tasks work today; only editing the client
 * record itself and managing its contact list require manage_clients.
 *
 * A Check-in is the lightweight case: logging one IS the record that the
 * client was contacted (dated now), plus a required next-contact date and
 * brief notes. That next-contact date also creates a matching Touchpoint
 * (monthly_visit — the closest existing fit) so it shows up in the
 * Touchpoints reminders list too, not just this client's Timeline. */
export async function logClientInteraction(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Enter a note or summary." };

  const type = String(formData.get("type") ?? "note");
  const nextContactDate = emptyToNull(formData.get("next_contact_date"));
  if (type === "check_in" && !nextContactDate) {
    return { error: "Next contact date is required for a check-in." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: interaction, error } = await supabase
    .from("client_interactions")
    .insert({
      client_id: clientId,
      contact_id: emptyToNull(formData.get("contact_id")),
      type,
      subject: emptyToNull(formData.get("subject")),
      body,
      next_contact_date: type === "check_in" ? nextContactDate : null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (type === "check_in" && nextContactDate && interaction) {
    await supabase.from("touchpoints").insert({
      client_id: clientId,
      type: "monthly_visit",
      due_date: nextContactDate,
      notes: body,
      owner_id: user?.id ?? null,
      source_client_interaction_id: interaction.id,
    });
    revalidatePath("/touchpoints");
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

// Text extraction was tried and dropped — pdf-parse's output was unreliable
// enough on real quotes/reviews to not be worth trusting in AI Insights or
// showing as the entry's body. This just stores and attaches the file now;
// viewing/downloading it is how you read it.
const ACCEPTED_DOC_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/** Shared upload+insert logic behind both uploadClientDocument (Timeline,
 * project_id null) and uploadProjectDocument (project_id set) — same
 * private storage bucket, served through /api/documents/[id]. */
async function uploadInteractionDocument(
  clientId: string,
  projectId: string | null,
  category: string,
  formData: FormData
): Promise<FormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  // Some browsers/OSes report an older .doc/.xls file as
  // application/octet-stream rather than its real MIME type — fall back
  // to the file extension so a real file isn't rejected on a mislabeled
  // MIME type.
  const extensionOk = /\.(pdf|docx?|xlsx?)$/i.test(file.name);
  if (!ACCEPTED_DOC_TYPES[file.type] && !extensionOk) {
    return {
      error: "Only PDF, Word, or Excel documents (.pdf, .doc, .docx, .xls, .xlsx) are supported.",
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is larger than 20MB." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clientId}/${crypto.randomUUID()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("client-documents")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { error: uploadError.message };

  const subject = emptyToNull(formData.get("subject")) ?? file.name;
  const { error } = await supabase.from("client_interactions").insert({
    client_id: clientId,
    project_id: projectId,
    contact_id: emptyToNull(formData.get("contact_id")),
    type: category,
    subject,
    body: "Document uploaded — view or download it below.",
    attachment_path: path,
    attachment_filename: file.name,
    created_by: user?.id ?? null,
  });

  if (error) {
    // Don't leave an orphaned file in storage if the row it belongs to
    // failed to insert.
    await supabase.storage.from("client-documents").remove([path]);
    return { error: error.message };
  }

  return { error: null };
}

/** A document logged to a client's Timeline the same way a manually typed
 * note is — the original file is attached for viewing/download. Open to
 * any signed-in user, matching logClientInteraction's posture: uploading
 * a document a tech received from a client isn't a "manage_clients"
 * action. */
export async function uploadClientDocument(
  clientId: string,
  category: "quote" | "review" | "document",
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const result = await uploadInteractionDocument(clientId, null, category, formData);
  if (!result.error) revalidatePath(`/clients/${clientId}`);
  return result;
}

/** A project's own manually-uploaded document (PDF/Word/Excel) — same
 * mechanism as uploadClientDocument, but scoped to the project
 * (project_id set) rather than the client's Timeline. */
export async function uploadProjectDocument(
  projectId: string,
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const result = await uploadInteractionDocument(clientId, projectId, "document", formData);
  if (!result.error) revalidatePath("/projects");
  return result;
}

export type AutotaskQuoteOption = {
  id: number;
  name: string;
  quoteNumber: number | null;
  approvalStatus: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  webLink: string;
};

/** Every Autotask quote for this client (via its Opportunities — Quotes
 * have no direct company filter), each with a deep link to its own
 * quote.asp page — Autotask's Quotes API has no PDF/portal link of its
 * own, so this is the only clickable way back to the quote itself. */
export async function listAutotaskQuotesForClientAction(
  clientId: string
): Promise<{ quotes: AutotaskQuoteOption[] } | { error: string }> {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("autotask_company_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.autotask_company_id) {
    return { error: "This client isn't linked to an Autotask company yet." };
  }

  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  if (!settings.webZoneUrl) {
    return {
      error: "Re-test the Autotask connection under Settings → Integrations to enable quote links.",
    };
  }
  const webZoneUrl = settings.webZoneUrl;

  try {
    const quotes = await fetchQuotesForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    return {
      quotes: quotes.map((q) => ({ ...q, webLink: buildAutotaskQuoteUrl(webZoneUrl, q.id) })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Autotask lookup failed." };
  }
}

/** Logs a quote reference under one project (not the client's Timeline —
 * project_id being set is what keeps it out of there, see the Timeline
 * query's own .is("project_id", null) filter) — a text reference
 * (name/number/status/dates) plus a deep link back to the Autotask quote,
 * not a document. */
export async function logAutotaskQuoteReference(
  clientId: string,
  projectId: string,
  quote: {
    name: string;
    quoteNumber: number | null;
    approvalStatus: string | null;
    effectiveDate: string | null;
    expirationDate: string | null;
    webLink: string;
  }
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const details = [
    quote.quoteNumber ? `Quote #${quote.quoteNumber}` : null,
    quote.approvalStatus,
    quote.effectiveDate ? `effective ${quote.effectiveDate.slice(0, 10)}` : null,
    quote.expirationDate ? `expires ${quote.expirationDate.slice(0, 10)}` : null,
  ].filter(Boolean);

  const { error } = await supabase.from("client_interactions").insert({
    client_id: clientId,
    project_id: projectId,
    type: "quote",
    subject: quote.name,
    body: details.length > 0 ? details.join(" · ") : "Referenced from Autotask.",
    external_link: quote.webLink,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/projects");
  return { error: null };
}

/** Removes a Timeline entry — a wrong upload, a mistaken note, etc — and
 * its attached file, if any. Anyone can remove their own entry (undoing
 * your own mistake shouldn't need elevated permission), but removing
 * someone else's requires manage_clients, same as the contact list. */
export async function deleteClientInteraction(clientId: string, interactionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: interaction } = await supabase
    .from("client_interactions")
    .select("created_by, attachment_path")
    .eq("id", interactionId)
    .maybeSingle();
  if (!interaction) return;

  const isOwnEntry = Boolean(user) && interaction.created_by === user!.id;
  if (!isOwnEntry && !(await hasPermission(supabase, "manage_clients"))) return;

  await supabase.from("client_interactions").delete().eq("id", interactionId);
  if (interaction.attachment_path) {
    await supabase.storage.from("client-documents").remove([interaction.attachment_path]);
  }

  revalidatePath(`/clients/${clientId}`);
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

/** Creates a client directly from an Autotask company — no separate "New
 * client" form, then a separate "Link to Autotask" step afterward. If a
 * client is already mapped to this Autotask company, returns its id
 * instead of creating a duplicate. */
export async function createClientFromAutotaskCompany(
  company: AutotaskCompany
): Promise<{ clientId: string } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("autotask_company_id", company.id)
    .maybeSingle();
  if (existing) return { clientId: existing.id };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: company.companyName,
      autotask_company_id: company.id,
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Best-effort — the client is created either way; a sync hiccup here
  // (e.g. a transient Autotask error) just means the first sync happens
  // whenever "Sync Autotask" is next clicked instead of immediately.
  await syncClientAutotaskData(data.id);

  revalidatePath("/clients");
  return { clientId: data.id };
}

/** Every active Autotask company not already added here, for the "add
 * multiple clients" checklist — loaded up front rather than searched, so
 * picking several doesn't mean searching and adding one at a time. */
export async function listUnaddedActiveAutotaskCompaniesAction(): Promise<
  { companies: AutotaskCompany[] } | { error: string }
> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const companies = await fetchActiveAutotaskCompanies(settings.credentials, settings.zoneUrl);
    const { data: existingClients } = await admin
      .from("clients")
      .select("autotask_company_id")
      .not("autotask_company_id", "is", null);
    const existingIds = new Set(
      (existingClients ?? []).map((c: { autotask_company_id: number }) => c.autotask_company_id)
    );
    return { companies: companies.filter((c) => !existingIds.has(c.id)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Autotask lookup failed." };
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

    // Tickets tagged with the Project SLA become this client's Projects —
    // replace-on-sync, same as tickets/contract services above, so a
    // project's status/dates always reflect Autotask, not a stale copy.
    const projectTickets = await fetchProjectSlaTicketsForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id,
      labels
    );
    await admin
      .from("projects")
      .delete()
      .eq("client_id", clientId)
      .not("source_autotask_ticket_id", "is", null);
    if (projectTickets.length > 0) {
      await admin
        .from("projects")
        .insert(projectTickets.map((p) => ({ ...p, client_id: clientId })));
    }

    // Autotask enforces at most one primaryContact per company — this is
    // a real designation, not a guess, and isn't user-editable here.
    const primaryContact = await fetchPrimaryContactForCompany(
      settings.credentials,
      settings.zoneUrl,
      client.autotask_company_id
    );
    await admin
      .from("clients")
      .update({
        primary_contact_name: primaryContact?.name ?? null,
        primary_contact_email: primaryContact?.email ?? null,
      })
      .eq("id", clientId);
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

/** On-demand AI read of every open ticket for this client — description,
 * resolution, and notes — flagging what's actually important and what's
 * still pending on our side. Notes carry the same content class as
 * getAutotaskTicketDetailAction pulls, so this is gated the same way. */
export async function analyzeTicketsAction(
  clientId: string
): Promise<{ insights: TicketInsight[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();

  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }

  const autotaskSettings = await getAutotaskSettings(admin);
  if (!autotaskSettings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const zoneUrl = autotaskSettings.zoneUrl;

  const { data: tickets } = await admin
    .from("autotask_tickets")
    .select("id, ticket_number, title, description, resolution, status")
    .eq("client_id", clientId);

  if (!tickets || tickets.length === 0) return { insights: [] };

  try {
    // Sequential — same Autotask concurrent-thread-cap reasoning as
    // getAutotaskTicketDetailAction above.
    const notesByTicket = new Map<number, AutotaskTicketNote[]>();
    for (const t of tickets) {
      notesByTicket.set(t.id, await fetchTicketNotes(autotaskSettings.credentials, zoneUrl, t.id));
    }

    const insights = await generateTicketInsights(tickets, notesByTicket, aiSettings);
    return { insights };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to analyze tickets." };
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

export type M365FormState = { error: string | null; success: string | null };

/** Saves this client's own Microsoft 365 app-registration credentials
 * (Tenant ID/Client ID/Secret from an app registration their own admin
 * created and consented in their tenant) — replaces the old GDAP-based
 * "search and link" flow entirely, since there's no shared directory of
 * customer tenants anymore. Secret is write-only, same pattern as
 * Autotask/NinjaOne — leaving it blank keeps whatever is already saved. */
export async function saveM365ClientCredentialsAction(
  clientId: string,
  _prevState: M365FormState,
  formData: FormData
): Promise<M365FormState> {
  const user = await requirePermission("manage_clients");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const appClientId = String(formData.get("app_client_id") ?? "").trim();
  const appClientSecret = emptyToNull(formData.get("app_client_secret"));

  if (!tenantId || !appClientId) {
    return { error: "Tenant ID and Client ID are required.", success: null };
  }

  const admin = createAdminClient();
  const existing = await getM365ClientSettings(admin, clientId);
  const effectiveSecret = appClientSecret ?? existing?.credentials.appClientSecret;
  if (!effectiveSecret) {
    return { error: "A Client Secret is required for first-time setup.", success: null };
  }

  await admin.from("clients").update({ m365_tenant_id: tenantId }).eq("id", clientId);

  const payload: {
    client_id: string;
    app_client_id: string;
    updated_by: string;
    app_client_secret?: string;
    cached_access_token: null;
    token_expires_at: null;
  } = {
    client_id: clientId,
    app_client_id: appClientId,
    updated_by: user.id,
    cached_access_token: null,
    token_expires_at: null,
  };
  if (appClientSecret) payload.app_client_secret = appClientSecret;

  const { error } = await admin
    .from("m365_client_credentials")
    .upsert(payload, { onConflict: "client_id" });
  if (error) return { error: error.message, success: null };

  revalidatePath(`/clients/${clientId}`);
  return { error: null, success: "Saved." };
}

/** Tests this client's saved credentials — doesn't persist anything, just
 * reports whether they work. */
export async function testM365ClientConnectionAction(
  clientId: string
): Promise<{ ok: boolean; message: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getM365ClientSettings(admin, clientId);
  if (!settings) {
    return { ok: false, message: "Save this client's Microsoft 365 credentials first." };
  }

  const result = await testM365ClientConnection(settings.credentials satisfies M365ClientCredentials);
  if (!result.ok) return { ok: false, message: result.error ?? "Connection failed." };
  return { ok: true, message: "Connected — credentials are working." };
}

export async function unlinkClientM365Tenant(clientId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ m365_tenant_id: null }).eq("id", clientId);
  await supabase.from("m365_client_credentials").delete().eq("client_id", clientId);
  await supabase.from("m365_license_summary").delete().eq("client_id", clientId);
  await supabase.from("m365_secure_score").delete().eq("client_id", clientId);
  await supabase.from("m365_secure_score_gaps").delete().eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

/** On-demand sync for a single mapped client — licenses and Secure Score
 * gaps together, one click. Each client has its own independent
 * credentials, so there's no shared-token rotation concern the way GDAP
 * had — the cron route can even run these concurrently if it wants to. */
export async function syncClientM365Data(clientId: string): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getM365ClientSettings(admin, clientId);
  if (!settings) {
    return { error: "This client isn't linked to Microsoft 365 yet." };
  }

  try {
    const customerToken = await getValidM365Token(admin, clientId, settings);

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

const AUTO_SYNC_THROTTLE_MS = 60 * 60 * 1000;

/** Fired (not awaited) from a client's own page on every visit, so
 * devices reflect recent NinjaOne changes without a manual "Sync
 * NinjaOne" click — but only if the last auto-sync was more than an hour
 * ago, and always in the background so a visit never waits on NinjaOne.
 * Same throttle-then-detach pattern as
 * autoSyncAutotaskProjectsIfStale (src/app/(dashboard)/projects/actions.ts),
 * just scoped to one client's timestamp instead of one org-wide one since
 * this syncs a single client rather than every mapped client at once. */
export async function autoSyncClientNinjaOneIfStale(clientId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("ninjaone_organization_id, ninjaone_last_synced_at")
    .eq("id", clientId)
    .single();
  if (!client?.ninjaone_organization_id) return;

  const lastSyncedAt = client.ninjaone_last_synced_at
    ? new Date(client.ninjaone_last_synced_at).getTime()
    : 0;
  if (Date.now() - lastSyncedAt < AUTO_SYNC_THROTTLE_MS) return;

  const settings = await getNinjaOneSettings(admin);
  if (!settings) return;

  await admin
    .from("clients")
    .update({ ninjaone_last_synced_at: new Date().toISOString() })
    .eq("id", clientId);

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
    console.error("Background NinjaOne auto-sync failed", err);
  }
}

/** Same throttled background pattern as autoSyncClientNinjaOneIfStale,
 * for M365 licenses/Secure Score gaps. */
export async function autoSyncClientM365IfStale(clientId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("m365_last_synced_at")
    .eq("id", clientId)
    .single();

  const lastSyncedAt = client?.m365_last_synced_at
    ? new Date(client.m365_last_synced_at).getTime()
    : 0;
  if (Date.now() - lastSyncedAt < AUTO_SYNC_THROTTLE_MS) return;

  const settings = await getM365ClientSettings(admin, clientId);
  if (!settings) return;

  await admin
    .from("clients")
    .update({ m365_last_synced_at: new Date().toISOString() })
    .eq("id", clientId);

  try {
    const customerToken = await getValidM365Token(admin, clientId, settings);

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
    console.error("Background M365 auto-sync failed", err);
  }
}
