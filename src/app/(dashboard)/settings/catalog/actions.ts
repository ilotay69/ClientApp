"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { ymd } from "@/lib/resource-hours";
import {
  fetchTimeEntriesForAnalysis,
  analyzeTimeEntryPatterns,
  type ClientPatternReport,
} from "@/lib/time-entry-insights";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createServiceOffering(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("services").insert({
    name,
    description: emptyToNull(formData.get("description")),
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  return { error: null };
}

export async function deleteServiceOffering(serviceId: string) {
  if (!(await requirePermission("manage_services"))) return;

  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", serviceId);
  revalidatePath("/settings/catalog");
  revalidatePath("/clients");
}

/** Client list for the sales-opportunity picker — id/name only, cheap. */
export async function getClientsForServiceGapsAction(): Promise<
  { id: string; name: string }[] | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const { data: clients } = await admin.from("clients").select("id, name").order("name");
  return clients ?? [];
}

export type ClientServiceGap = { serviceName: string; otherClientCount: number };

/** Microsoft's own per-seat cloud licensing varies by client based on seat
 * count and plan tier they've already chosen — not a missing-service
 * upsell signal the way a security tool or backup gap is, so any of it
 * is excluded from this comparison entirely rather than showing up as a
 * "gap" just because two clients are on different Microsoft SKUs. Not
 * every Microsoft license name contains "365" (Exchange/SharePoint
 * Online, Intune, Entra ID, Power Platform, Defender, Windows Enterprise,
 * Enterprise Mobility + Security, etc. don't), so this matches by known
 * Microsoft cloud-licensing product families rather than just that one
 * word — a maintained list, not a live lookup, so a name that genuinely
 * doesn't match any of these still shows up as a real comparison point. */
const MICROSOFT_LICENSE_KEYWORDS = [
  "365",
  "office 365",
  "microsoft 365",
  "m365",
  "o365",
  "azure ad",
  "azure active directory",
  "entra id",
  "entra",
  "exchange online",
  "exchange plan",
  "exchange e-mail hosting",
  "exchange email hosting",
  "sharepoint online",
  "sharepoint",
  "onedrive for business",
  "intune",
  "windows enterprise",
  "windows 10 enterprise",
  "windows 11 enterprise",
  "windows server",
  "power bi",
  "power apps",
  "power automate",
  "power virtual agents",
  "power platform",
  "visio",
  "project online",
  "project plan",
  "planner",
  "teams",
  "copilot",
  "defender for office",
  "defender for endpoint",
  "defender for identity",
  "defender for cloud apps",
  "microsoft defender",
  "dynamics 365",
  "viva",
  "azure information protection",
  "office 365 atp",
  "advanced threat protection",
  "enterprise mobility + security",
  "ems e3",
  "ems e5",
  "remote desktop",
];

/** Not Microsoft, but flagged the same way — generic infrastructure/
 * hosting line items (storage, application hosting, backup) and specific
 * vendor product lines (Proofpoint, BitDefender) that this MSP's own
 * catalog treats as standard/near-universal rather than a real upsell
 * differentiator. Same maintained-list approach and same caveat as
 * MICROSOFT_LICENSE_KEYWORDS above. */
const OTHER_EXCLUDED_KEYWORDS = [
  "proofpoint",
  "bitdefender",
  "data storage",
  "application hosting",
  "3rd party backup",
  "remote backup",
  "smartphone wireless sync",
];

function isExcludedService(serviceName: string): boolean {
  const lower = serviceName.toLowerCase();
  return (
    MICROSOFT_LICENSE_KEYWORDS.some((kw) => lower.includes(kw)) ||
    OTHER_EXCLUDED_KEYWORDS.some((kw) => lower.includes(kw))
  );
}

/** Strips the varying size/duration tier off a service name — e.g.
 * "Slide - Backup and DR - Z2 - 1TB - 1yr" and "...- 6TB - 1yr" are the
 * same underlying product at a different storage size, not two separate
 * things a client could be missing one of. Used only to build the
 * display label; normalizeServiceKey (below) does the actual grouping. */
function stripVariantTokens(name: string): string {
  return name
    .replace(/\b\d+(\.\d+)?\s*(GB|TB|MB)\b/gi, "")
    .replace(/\b\d+\s*(yrs?|years?|mo|months?)\b/gi, "")
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*-\s*$/, "")
    .trim();
}

/** Groups variants of the same product together even when formatting is
 * inconsistent between them (e.g. one entry missing a dash the others
 * have) — strips the size/duration tier, then collapses everything down
 * to bare lowercase words so "Backup and DR - Z2" and "Backup and DR Z2"
 * key identically. */
function normalizeServiceKey(name: string): string {
  return stripVariantTokens(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic, no AI: for one client, every distinct ACTIVE Autotask
 * contracted service name that at least one OTHER client has and this
 * one doesn't — sorted by how many other clients have it, so the
 * strongest upsell signal (something almost everyone else has) sorts
 * first. Normalized-name comparison (see normalizeServiceKey), not exact
 * string or cross-vendor category matching — different size/duration
 * tiers of the same product (e.g. "Slide - Backup and DR - Z2 - 1TB -
 * 1yr" vs "...- 6TB - 1yr") collapse into one row, but a genuinely
 * different vendor for the same protection still shows as two; an
 * AI-judgment version of this kept collapsing everything into broad
 * umbrella categories that hid real gaps, so this trades that
 * "different vendor, same protection" nuance for something that reliably
 * finds gaps at all; a human reviewing the list can tell "Huntress MDR"
 * isn't a real gap for a client that already has "SentinelOne MDR". */
export async function getClientServiceGapsAction(clientId: string): Promise<
  { clientName: string; gaps: ClientServiceGap[] } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const [{ data: client }, { data: contractServices }] = await Promise.all([
    admin.from("clients").select("id, name").eq("id", clientId).single(),
    admin
      .from("autotask_contract_services")
      .select("client_id, service_name, contract_status"),
  ]);
  if (!client) return { error: "Client not found." };

  const active = (contractServices ?? []).filter(
    (cs: { contract_status: string | null; service_name: string }) =>
      cs.contract_status?.toLowerCase() === "active" && !isExcludedService(cs.service_name)
  ) as { client_id: string; service_name: string }[];

  if (active.length === 0) {
    return {
      error:
        "No active Autotask contracted services found across any client — sync Autotask on at least one client first.",
    };
  }

  const thisClientServices = new Set(
    active.filter((cs) => cs.client_id === clientId).map((cs) => normalizeServiceKey(cs.service_name))
  );

  const otherClientIdsByService = new Map<string, Set<string>>();
  const displayNameByService = new Map<string, string>();
  for (const cs of active) {
    if (cs.client_id === clientId) continue;
    const key = normalizeServiceKey(cs.service_name);
    if (!displayNameByService.has(key)) {
      displayNameByService.set(key, stripVariantTokens(cs.service_name));
    }
    const set = otherClientIdsByService.get(key) ?? new Set<string>();
    set.add(cs.client_id);
    otherClientIdsByService.set(key, set);
  }

  const gaps: ClientServiceGap[] = [...otherClientIdsByService.entries()]
    .filter(([key]) => !thisClientServices.has(key))
    .map(([key, clientIds]) => ({
      serviceName: displayNameByService.get(key) ?? key,
      otherClientCount: clientIds.size,
    }))
    .sort((a, b) => b.otherClientCount - a.otherClientCount);

  return { clientName: client.name, gaps };
}

const PATTERN_ANALYSIS_DAYS = 90;

/** Fetches the last 90 days of Autotask time entries live and asks the
 * active AI provider to find recurring issues and inconsistent effort
 * across it — entirely on demand, nothing read from or written to this
 * app's own database beyond the existing client mappings needed to
 * attribute an entry to a client. */
export async function analyzeTimeEntryPatternsAction(): Promise<
  { clients: ClientPatternReport[]; entryCount: number } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const [aiSettings, autotaskSettings] = await Promise.all([
    getActiveAiSettings(admin),
    getAutotaskSettings(admin),
  ]);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }
  if (!autotaskSettings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - PATTERN_ANALYSIS_DAYS);

  try {
    const entries = await fetchTimeEntriesForAnalysis(
      admin,
      autotaskSettings.credentials,
      autotaskSettings.zoneUrl,
      ymd(since),
      ymd(today)
    );
    if (entries.length === 0) {
      return { error: "No time entries found in Autotask for the past 90 days." };
    }
    const clients = await analyzeTimeEntryPatterns(entries, aiSettings);
    return { clients, entryCount: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
