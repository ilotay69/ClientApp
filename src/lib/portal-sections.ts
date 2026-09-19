import { createAdminClient } from "@/lib/supabase/server";
import type { PortalSession } from "@/lib/portal";
import type { PortalPageKey } from "@/lib/portal-roles";
import { PORTAL_PAGE_LABELS } from "@/lib/portal-roles";
import { matchesQuery, type PortalFilters } from "@/lib/portal-filters";
import {
  fetchPortalTicketList,
  fetchPortalLicences,
  fetchPortalDevices,
  fetchPortalHuntress,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  type PortalTicketListItem,
  type PortalDevice,
} from "@/lib/portal-data";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchContractUsageForCompany, type ContractTimeEntryRow } from "@/lib/contract-hours";
import { fetchForticloudDeviceInventory, STATUS_RANK, type ForticloudDeviceRow } from "@/lib/forticloud-lookups";
import { listForticloudAccounts } from "@/lib/forticloud-settings";
import type { HuntressAgent } from "@/lib/huntress";
import { checkDomainHealth, extractDomainFromEmail, type DomainHealthReport } from "@/lib/domain-health";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";
import { licenseUsageStatus, type ReportData } from "@/lib/reports";
import { formatDate, humanizeLabel } from "@/lib/format";

/**
 * One module per portal section is the obvious structure, and it is the
 * wrong one here. Every section has to be fetched twice — once to render
 * the page, once to build the CSV/PDF the client downloads — and the whole
 * requirement is that the file matches the filters on screen. Two call
 * sites reaching for the same function with the same filters is the only
 * arrangement where that cannot quietly stop being true, so each section
 * below exposes exactly one fetch-and-filter function, and both the page
 * and /api/portal/export call it.
 *
 * Everything here runs under the service-role key (portal reads always do
 * — a role='client' login has no useful table access under RLS), which
 * means no policy is protecting this data. The caller's PortalSession is,
 * and every function takes one rather than a client id so "I forgot to
 * check who is asking" is a type error rather than a leak.
 */

/** A value a filter <select> can offer, derived from the data actually
 * present rather than a hardcoded vocabulary — a status nobody's tickets
 * are in is not worth offering. */
export type PortalFacet = { value: string; label: string; count: number };

export type PortalSectionResult<TRow> = {
  rows: TRow[];
  /** Row count BEFORE filtering, so the UI can honestly say "18 of 340"
   * instead of implying the client only has 18 of anything. */
  totalBeforeFilter: number;
  /** Non-null means "show this message instead of a table" — not linked to
   * the vendor, integration not configured, or a failed live call. */
  unavailableReason: string | null;
  lastSyncedAt?: string | null;
  facets: Record<string, PortalFacet[]>;
};

function facetsFrom(values: (string | null | undefined)[]): PortalFacet[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

function empty<T>(reason: string | null): PortalSectionResult<T> {
  return { rows: [], totalBeforeFilter: 0, unavailableReason: reason, facets: {} };
}

// ---------------------------------------------------------------------------
// Open tickets
// ---------------------------------------------------------------------------

export function normalizeLookbackDays(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.max(n, 1), MAX_LOOKBACK_DAYS);
}

export async function fetchTicketsSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<PortalTicketListItem>> {
  const days = normalizeLookbackDays(filters.days);
  const { tickets, unavailableReason } = await fetchPortalTicketList(session, days);
  if (unavailableReason) return empty(unavailableReason);

  const rows = tickets.filter(
    (t) =>
      matchesQuery(filters.q, [t.title, t.ticketNumber, t.description]) &&
      (!filters.status || t.status === filters.status) &&
      (!filters.priority || t.priority === filters.priority)
  );

  return {
    rows,
    totalBeforeFilter: tickets.length,
    unavailableReason: null,
    facets: {
      status: facetsFrom(tickets.map((t) => t.status)),
      priority: facetsFrom(tickets.map((t) => t.priority)),
    },
  };
}

// ---------------------------------------------------------------------------
// Microsoft 365 licences
// ---------------------------------------------------------------------------

/** Microsoft reports its free/unlimited SKUs (Power BI Standard, Flow Free,
 * Teams Exploratory) with absurd seat counts — 10,000 or 1,000,000 — which
 * then dominate any sort by purchased seats and make the real, paid-for
 * picture unreadable. Hidden by default, with a toggle, rather than
 * excluded outright: a client who wants the raw list should be able to see
 * it, and a silently-truncated table is worse than a labelled one. */
export const LARGE_SKU_SEAT_THRESHOLD = 10_000;

export type PortalLicenceRow = {
  skuPartNumber: string;
  name: string;
  purchased: number;
  consumed: number;
  available: number;
  percentUsed: number;
  status: string;
};

export type PortalLicencesSection = PortalSectionResult<PortalLicenceRow> & {
  /** How many rows the >10,000-seat rule is holding back, so the toggle can
   * say what it would reveal instead of being an unexplained switch. */
  hiddenLargeCount: number;
  showingLarge: boolean;
};

export async function fetchLicencesSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalLicencesSection> {
  const { licences, lastSyncedAt, linked } = await fetchPortalLicences(session);
  if (!linked) {
    return {
      ...empty<PortalLicenceRow>("Microsoft 365 reporting isn't set up for your account yet."),
      hiddenLargeCount: 0,
      showingLarge: false,
    };
  }

  const all: PortalLicenceRow[] = licences
    .filter((l) => l.enabledUnits > 0)
    .map((l) => {
      const percentUsed = (l.consumedUnits / l.enabledUnits) * 100;
      const rounded = Math.round(percentUsed);
      return {
        skuPartNumber: l.skuPartNumber,
        name: friendlyM365SkuName(l.skuPartNumber),
        purchased: l.enabledUnits,
        consumed: l.consumedUnits,
        available: l.enabledUnits - l.consumedUnits,
        percentUsed: rounded,
        status: licenseUsageStatus(l.enabledUnits, rounded),
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const showingLarge = filters.showLarge === "1";
  const withinThreshold = all.filter((r) => r.purchased <= LARGE_SKU_SEAT_THRESHOLD);
  const visible = showingLarge ? all : withinThreshold;

  const rows = visible.filter(
    (r) =>
      matchesQuery(filters.q, [r.name, r.skuPartNumber]) &&
      (!filters.usage || r.status === filters.usage)
  );

  return {
    rows,
    totalBeforeFilter: visible.length,
    unavailableReason: null,
    lastSyncedAt,
    hiddenLargeCount: all.length - withinThreshold.length,
    showingLarge,
    facets: { usage: facetsFrom(visible.map((r) => r.status)) },
  };
}

// ---------------------------------------------------------------------------
// Contract & time entries
// ---------------------------------------------------------------------------

export type PortalContractBlockWithEntries = {
  contractId: number;
  contractName: string;
  purchased: number;
  used: number;
  remaining: number;
  percentUsed: number;
  startDate: string;
  endDate: string;
  entries: ContractTimeEntryRow[];
};

export async function fetchContractSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<PortalContractBlockWithEntries>> {
  const companyId = session.client.autotaskCompanyId;
  if (companyId == null) return empty("This account isn't linked to Autotask yet.");

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return empty("Contract data isn't available right now.");

  let blocks;
  try {
    blocks = await fetchContractUsageForCompany(admin, settings.credentials, settings.zoneUrl, companyId);
  } catch (err) {
    console.error("fetchContractSection failed", err);
    return empty("Contract data couldn't be loaded right now.");
  }
  if (blocks.length === 0) return empty("No active prepaid hour block right now.");

  const allEntries = blocks.flatMap((b) => b.entries);

  const keep = (e: ContractTimeEntryRow) =>
    matchesQuery(filters.q, [e.summaryNotes, e.resourceName, e.ticketId != null ? String(e.ticketId) : null]) &&
    (!filters.resource || e.resourceName === filters.resource) &&
    (!filters.from || e.dateWorked >= filters.from) &&
    (!filters.to || e.dateWorked <= filters.to);

  const rows: PortalContractBlockWithEntries[] = blocks.map((b) => ({
    contractId: b.contractId,
    contractName: b.contractName,
    purchased: b.purchased,
    used: b.used,
    remaining: b.remaining,
    percentUsed: b.percentUsed,
    startDate: b.startDate,
    endDate: b.endDate,
    // Blocks themselves are never filtered away — the purchased/used/
    // remaining figures must keep showing the truth about the contract even
    // when a date filter narrows the entry list below them to nothing.
    // Filtering the summary would let a client pick a date range and
    // conclude they had bought fewer hours than they had.
    entries: b.entries.filter(keep),
  }));

  return {
    rows,
    totalBeforeFilter: allEntries.length,
    unavailableReason: null,
    facets: { resource: facetsFrom(allEntries.map((e) => e.resourceName)) },
  };
}

// ---------------------------------------------------------------------------
// NinjaOne devices
// ---------------------------------------------------------------------------

export async function fetchDevicesSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<PortalDevice>> {
  const { devices, lastSyncedAt, linked } = await fetchPortalDevices(session);
  if (!linked) return empty("Device monitoring isn't set up for your account yet.");

  const rows = devices.filter((d) => {
    if (!matchesQuery(filters.q, [d.systemName, d.osName, d.manufacturer, d.model, d.cpuModel])) return false;
    if (filters.status === "online" && d.isOffline !== false) return false;
    if (filters.status === "offline" && d.isOffline !== true) return false;
    if (filters.class && d.nodeClass !== filters.class) return false;
    if (filters.os && d.osName !== filters.os) return false;
    return true;
  });

  return {
    rows,
    totalBeforeFilter: devices.length,
    unavailableReason: null,
    lastSyncedAt,
    facets: {
      class: facetsFrom(devices.map((d) => d.nodeClass)),
      os: facetsFrom(devices.map((d) => d.osName)),
    },
  };
}

// ---------------------------------------------------------------------------
// Huntress managed endpoints
// ---------------------------------------------------------------------------

/** An agent that hasn't phoned home in this long is reported as stale
 * rather than protected — the same week-long threshold the old Security
 * page used for its "not seen in over a week" stat. */
const HUNTRESS_STALE_DAYS = 7;

export function huntressAgentIsStale(agent: Pick<HuntressAgent, "lastCallbackAt">): boolean {
  if (!agent.lastCallbackAt) return true;
  return (Date.now() - new Date(agent.lastCallbackAt).getTime()) / 86_400_000 > HUNTRESS_STALE_DAYS;
}

export async function fetchHuntressSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<HuntressAgent>> {
  const { agents, linked, error } = await fetchPortalHuntress(session);
  if (!linked) return empty("Managed endpoint protection isn't set up for your account yet.");
  if (error) return empty(error);

  const rows = agents.filter((a) => {
    if (!matchesQuery(filters.q, [a.hostname, a.os, a.platform])) return false;
    if (filters.status === "stale" && !huntressAgentIsStale(a)) return false;
    if (filters.status === "healthy" && huntressAgentIsStale(a)) return false;
    if (filters.platform && a.platform !== filters.platform) return false;
    return true;
  });

  return {
    rows,
    totalBeforeFilter: agents.length,
    unavailableReason: null,
    facets: { platform: facetsFrom(agents.map((a) => a.platform)) },
  };
}

// ---------------------------------------------------------------------------
// FortiGate support expiry
// ---------------------------------------------------------------------------

/**
 * FortiCloud has no MSP-partner umbrella and no client mapping of its own:
 * one FortiCloud account holds devices belonging to many different
 * customers, distinguished only by what somebody typed in the device's
 * Description field. So the description IS the mapping, and it is matched
 * exactly (after trimming surrounding whitespace, case-insensitively)
 * against the client's name.
 *
 * Exact rather than fuzzy on purpose. A "contains" match would hand
 * "Northwind Dental" the devices of "Northwind Dental Holdings", and
 * showing one customer another customer's firewall inventory is a
 * materially worse failure than showing nothing. When this section looks
 * empty for a client who does have FortiGates, the fix is to correct the
 * Description in FortiCloud, not to loosen the match.
 */
function forticloudDescriptionMatches(description: string | null, clientName: string): boolean {
  if (!description) return false;
  return description.trim().toLowerCase() === clientName.trim().toLowerCase();
}

export async function fetchFortigateSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<ForticloudDeviceRow>> {
  const admin = createAdminClient();

  // Scoped to the client's own mapped account when there is one; otherwise
  // every account is searched, because the description match below is the
  // real boundary either way and a client whose account mapping is simply
  // unset should still see their own kit.
  const forticloudAccounts = await listForticloudAccounts(admin, session.client.forticloudAccountId);
  const accounts = forticloudAccounts.map((a) => ({ label: a.label, creds: a.credentials }));
  if (accounts.length === 0) return empty("FortiGate reporting isn't set up for your account yet.");

  let inventory: ForticloudDeviceRow[];
  try {
    inventory = await fetchForticloudDeviceInventory(accounts);
  } catch (err) {
    console.error("fetchFortigateSection: inventory fetch failed", err);
    return empty("FortiGate data couldn't be loaded right now.");
  }

  const mine = inventory
    .filter((d) => forticloudDescriptionMatches(d.description, session.client.clientName))
    .sort((a, b) => STATUS_RANK[a.supportStatus] - STATUS_RANK[b.supportStatus]);

  const rows = mine.filter(
    (d) =>
      matchesQuery(filters.q, [d.productModel, d.serialNumber, d.description]) &&
      (!filters.support || d.supportStatus === filters.support)
  );

  return {
    rows,
    totalBeforeFilter: mine.length,
    unavailableReason: null,
    facets: {
      support: facetsFrom(mine.map((d) => d.supportStatus)).map((f) => ({
        ...f,
        label: humanizeLabel(f.value),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Mailbox usage
// ---------------------------------------------------------------------------

export type PortalMailboxRow = {
  userPrincipalName: string;
  displayName: string | null;
  storageUsedBytes: number;
  quotaBytes: number;
  percentUsed: number;
  band: string;
};

/** Three bands rather than a raw percentage filter: "which mailboxes are
 * in trouble" is the only question anyone actually asks of this table. */
function usageBand(percent: number): string {
  if (percent >= 90) return "Critical";
  if (percent >= 75) return "Warning";
  return "Healthy";
}

export async function fetchMailboxSection(
  session: PortalSession,
  filters: PortalFilters
): Promise<PortalSectionResult<PortalMailboxRow>> {
  if (!session.client.m365TenantId) {
    return empty("Microsoft 365 reporting isn't set up for your account yet.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("m365_mailbox_usage")
    .select("user_principal_name, display_name, storage_used_bytes, prohibit_send_receive_quota_bytes, last_synced_at")
    .eq("client_id", session.client.clientId);

  if (error) {
    console.error("fetchMailboxSection failed", error);
    return empty("Mailbox usage isn't available right now.");
  }

  type MailboxRow = {
    user_principal_name: string;
    display_name: string | null;
    storage_used_bytes: number;
    prohibit_send_receive_quota_bytes: number;
    last_synced_at: string | null;
  };
  const raw = (data ?? []) as MailboxRow[];

  const all: PortalMailboxRow[] = raw
    .filter((m) => m.prohibit_send_receive_quota_bytes > 0)
    .map((m) => {
      const percentUsed = (m.storage_used_bytes / m.prohibit_send_receive_quota_bytes) * 100;
      return {
        userPrincipalName: m.user_principal_name,
        displayName: m.display_name,
        storageUsedBytes: m.storage_used_bytes,
        quotaBytes: m.prohibit_send_receive_quota_bytes,
        percentUsed,
        band: usageBand(percentUsed),
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const rows = all.filter(
    (m) =>
      matchesQuery(filters.q, [m.displayName, m.userPrincipalName]) &&
      (!filters.usage || m.band === filters.usage)
  );

  return {
    rows,
    totalBeforeFilter: all.length,
    unavailableReason: null,
    lastSyncedAt: raw[0]?.last_synced_at ?? null,
    facets: { usage: facetsFrom(all.map((m) => m.band)) },
  };
}

// ---------------------------------------------------------------------------
// Domain health
// ---------------------------------------------------------------------------

export type PortalDomainHealth = {
  domain: string | null;
  report: DomainHealthReport | null;
  unavailableReason: string | null;
};

/**
 * The domain is derived from the client's own record and is NOT accepted
 * from the URL. checkDomainHealth performs live DNS, WHOIS and
 * certificate-transparency lookups against whatever it is handed, so a
 * `?domain=` parameter would turn an authenticated portal into a
 * general-purpose lookup service running from our servers, pointable at
 * anyone. Deriving it means a client can only ever ask about themselves.
 */
/**
 * Contact addresses that tell us nothing about the CLIENT's domain.
 *
 * Checked because the domain is derived from whatever address happens to
 * be on the client record, and in production 4 clients have a consumer
 * mailbox there and 2 have ours. Without this, those six would each open
 * Domain Health and be shown a confident report on gmail.com — or, worse,
 * on CG Technologies' own DNS, SPF and registrar details. An honest "we
 * don't have your domain on file" is the only correct answer when the
 * address on file isn't the client's own.
 */
const NON_CLIENT_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.ca",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.ca",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "rogers.com",
  "sympatico.ca",
  "bell.net",
  "shaw.ca",
  "telus.net",
  // Ours. A client's record listing their account manager rather than
  // their own contact must never render as a report on us.
  "cgtechnologies.com",
]);

export async function fetchDomainSection(session: PortalSession): Promise<PortalDomainHealth> {
  const domain = extractDomainFromEmail(session.client.primaryContactEmail);
  if (!domain || NON_CLIENT_EMAIL_DOMAINS.has(domain.toLowerCase())) {
    return {
      domain: null,
      report: null,
      unavailableReason:
        "We don't have your company's own domain on file yet — ask your account manager to add it and this will fill in.",
    };
  }

  try {
    return { domain, report: await checkDomainHealth(domain), unavailableReason: null };
  } catch (err) {
    console.error("fetchDomainSection failed", err);
    return { domain, report: null, unavailableReason: "The domain check couldn't be completed right now." };
  }
}

// ---------------------------------------------------------------------------
// Downloads — every section's rows as the shared {headers, rows} shape that
// lib/csv.ts and lib/report-pdf.ts already know how to render.
// ---------------------------------------------------------------------------

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function diskUsedPercent(free: number | null, total: number | null): string {
  if (!total || total <= 0) return "";
  return `${Math.round(((total - (free ?? 0)) / total) * 100)}%`;
}

export async function buildPortalExport(
  session: PortalSession,
  section: PortalPageKey,
  filters: PortalFilters
): Promise<{ title: string; data: ReportData } | { error: string }> {
  const title = `${session.client.clientName} — ${PORTAL_PAGE_LABELS[section]}`;

  switch (section) {
    case "tickets": {
      const { rows, unavailableReason } = await fetchTicketsSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Ticket", "Title", "Status", "Priority", "Opened", "Due", "Last activity", "Billable hours"],
          rows: rows.map((t) => [
            t.ticketNumber,
            t.title,
            t.status,
            t.priority,
            t.openedAt ? formatDate(t.openedAt) : null,
            t.dueDate ? formatDate(t.dueDate) : null,
            t.lastActivityAt ? formatDate(t.lastActivityAt) : null,
            t.billableTimeEntries.reduce((s, e) => s + e.hoursWorked, 0).toFixed(2),
          ]),
        },
      };
    }

    case "licences": {
      const { rows, unavailableReason } = await fetchLicencesSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Subscription", "SKU", "Purchased", "Assigned", "Available", "% used", "Status"],
          rows: rows.map((r) => [
            r.name,
            r.skuPartNumber,
            r.purchased,
            r.consumed,
            r.available,
            `${r.percentUsed}%`,
            r.status,
          ]),
        },
      };
    }

    case "contracts": {
      const { rows, unavailableReason } = await fetchContractSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      // One row per time entry, with its block's name carried on each —
      // a flat table is what a spreadsheet can actually work with, and the
      // block totals are reproducible from it.
      return {
        title,
        data: {
          headers: ["Contract", "Date", "Hours", "Engineer", "Ticket", "Billable", "Approved", "Notes"],
          rows: rows.flatMap((b) =>
            b.entries.map((e) => [
              b.contractName,
              formatDate(e.dateWorked),
              e.hoursToBill.toFixed(2),
              e.resourceName,
              e.ticketId,
              e.isNonBillable ? "No" : "Yes",
              e.isApproved ? "Yes" : "No",
              e.summaryNotes,
            ])
          ),
        },
      };
    }

    case "devices": {
      const { rows, unavailableReason } = await fetchDevicesSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Device", "Status", "Type", "Operating system", "Manufacturer", "Model", "CPU", "RAM", "Disk used", "Disk size", "Last seen"],
          rows: rows.map((d) => [
            d.systemName,
            d.isOffline === false ? "Online" : "Offline",
            d.nodeClass ? humanizeLabel(d.nodeClass) : null,
            d.osName,
            d.manufacturer,
            d.model,
            d.cpuModel,
            d.ramBytes ? gb(d.ramBytes) : null,
            diskUsedPercent(d.diskFreeBytes, d.diskTotalBytes),
            d.diskTotalBytes ? gb(d.diskTotalBytes) : null,
            d.lastContact ? formatDate(d.lastContact) : null,
          ]),
        },
      };
    }

    case "huntress": {
      const { rows, unavailableReason } = await fetchHuntressSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Endpoint", "Platform", "Operating system", "Agent", "EDR", "Defender", "Firewall", "Last check-in", "Reporting"],
          rows: rows.map((a) => [
            a.hostname,
            a.platform,
            a.os,
            a.version,
            a.edrVersion,
            a.defenderStatus,
            a.firewallStatus,
            a.lastCallbackAt ? formatDate(a.lastCallbackAt) : null,
            huntressAgentIsStale(a) ? "Stale" : "Normal",
          ]),
        },
      };
    }

    case "fortigate": {
      const { rows, unavailableReason } = await fetchFortigateSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Model", "Serial", "Description", "Support status", "Support ends", "Hardware end of support"],
          rows: rows.map((d) => [
            d.productModel,
            d.serialNumber,
            d.description,
            humanizeLabel(d.supportStatus),
            d.supportEndDate ? formatDate(d.supportEndDate) : null,
            d.eosDate ? formatDate(d.eosDate) : null,
          ]),
        },
      };
    }

    case "mailbox": {
      const { rows, unavailableReason } = await fetchMailboxSection(session, filters);
      if (unavailableReason) return { error: unavailableReason };
      return {
        title,
        data: {
          headers: ["Mailbox", "Address", "Used", "Quota", "% used", "Status"],
          rows: rows.map((m) => [
            m.displayName,
            m.userPrincipalName,
            gb(m.storageUsedBytes),
            gb(m.quotaBytes),
            `${Math.round(m.percentUsed)}%`,
            m.band,
          ]),
        },
      };
    }

    case "domain": {
      const { domain, report, unavailableReason } = await fetchDomainSection(session);
      if (unavailableReason || !report || !domain) {
        return { error: unavailableReason ?? "Domain health isn't available right now." };
      }
      const rows: ReportData["rows"] = [
        ["SPF", report.spf.found ? "Found" : "Missing", report.spf.record],
        [
          "DMARC",
          report.dmarc.found ? `Found (p=${report.dmarc.policy ?? "unspecified"})` : "Missing",
          report.dmarc.record,
        ],
        ...report.dkim.map((d) => [`DKIM (${d.selector})`, d.found ? "Found" : "Missing", d.record]),
        ...report.subdomains.map((s) => [s.host, s.found ? `Found (${s.type})` : "Missing", s.target]),
      ];
      return { title: `${title} — ${domain}`, data: { headers: ["Check", "Result", "Record"], rows } };
    }

    case "reviews":
    case "onboarding":
      return { error: "This section has no download." };
  }
}
