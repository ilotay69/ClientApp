import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { getHuntressSettings } from "@/lib/huntress-settings";
// fetchHuntressAgents rather than huntress-lookups' fetchHuntressAgentsFull:
// that wrapper additionally fetches EVERY Huntress organization just to
// resolve a display name, which we already know here — so it's an extra API
// call, and one that reaches across other clients' orgs to make it.
import { fetchHuntressAgents, type HuntressAgent } from "@/lib/huntress";
import {
  fetchContractsForCompany,
  fetchContractBlocksForContractsInRange,
  fetchTimeEntriesForContracts,
  fetchTicketsCreatedForCompany,
  fetchTicketPicklists,
  fetchTicketsForCompanyInWindow,
  type AutotaskPortalTicketRow,
} from "@/lib/autotask";
import { DEFAULT_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS } from "@/lib/mailbox-review";
import type { PortalSession } from "@/lib/portal";

export { DEFAULT_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS };

/**
 * Every read a client-portal page makes.
 *
 * Two rules hold throughout this file, and both matter because these run with
 * the SERVICE-ROLE client — which bypasses RLS *and* column grants, so it is
 * the only thing standing between a customer and the whole database:
 *
 *   1. Scope comes from `session.client.clientId`, which getPortalContext()
 *      resolved from the signed-in user's own profile row. Nothing here takes
 *      a client id as an argument.
 *   2. Every select names its columns explicitly. `select("*")` on these
 *      tables would sweep up internal fields — autotask_tickets carries
 *      queue_name and assigned_resource_name, which are ours, not theirs.
 *
 * Cached tables are preferred over live vendor APIs wherever one exists: it
 * keeps client traffic off CG's vendor rate limits, and the sync timestamp
 * gives an honest "as of" to show rather than pretending the number is live.
 */

// ---------------------------------------------------------------------------
// Contract block hours, by month
// ---------------------------------------------------------------------------

export type PortalContractBlock = {
  contractId: number;
  contractName: string;
  purchased: number;
  used: number;
  remaining: number;
  percentUsed: number;
  startDate: string;
  endDate: string;
};

export type PortalContractMonth = {
  /** First day of the month being shown, "YYYY-MM-01". */
  month: string;
  blocks: PortalContractBlock[];
  /** Billable hours per day within the month, for the burn-down chart. */
  dailyUsage: { label: string; value: number }[];
  totalHoursInMonth: number;
  unavailableReason: string | null;
};

/** Month bounds as plain "YYYY-MM-DD" strings.
 *
 * Deliberately string arithmetic on UTC parts rather than local Date
 * construction: Autotask compares these as dates, and a server in a
 * behind-UTC timezone would otherwise resolve "this month" to the previous
 * one for the first hours of the 1st. */
function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Shifts a "YYYY-MM-01" string by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export async function fetchPortalContractMonth(
  session: PortalSession,
  month: string
): Promise<PortalContractMonth> {
  const empty = (reason: string | null): PortalContractMonth => ({
    month,
    blocks: [],
    dailyUsage: [],
    totalHoursInMonth: 0,
    unavailableReason: reason,
  });

  const companyId = session.client.autotaskCompanyId;
  if (companyId == null) return empty("This account isn't linked to Autotask yet.");

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  // zone_url stays null until the Autotask connection has been tested once.
  if (!settings?.zoneUrl) return empty("Contract data isn't available right now.");

  const { from, to } = monthBounds(month);

  try {
    const contracts = await fetchContractsForCompany(settings.credentials, settings.zoneUrl, companyId);
    if (contracts.length === 0) return empty(null);

    const contractIds = contracts.map((c) => c.id);
    const contractById = new Map(contracts.map((c) => [c.id, c]));

    const blocks = await fetchContractBlocksForContractsInRange(
      settings.credentials,
      settings.zoneUrl,
      contractIds,
      from,
      to
    );
    if (blocks.length === 0) return empty(null);

    // One fetch spanning the earliest overlapping block's start through the
    // end of the month; each block narrows to its own range below, because a
    // contract can have several sequential blocks (one per renewal) and
    // lumping them together misattributes hours between them.
    const earliestStart = blocks.reduce(
      (min, b) => (b.startDate < min ? b.startDate : min),
      blocks[0].startDate
    );
    const entries = await fetchTimeEntriesForContracts(
      settings.credentials,
      settings.zoneUrl,
      contractIds,
      earliestStart < from ? earliestStart : from,
      to
    );

    const billableByContract = new Map<number, { day: string; hours: number }[]>();
    for (const e of entries) {
      if (e.contractID == null || e.isNonBillable) continue;
      const list = billableByContract.get(e.contractID) ?? [];
      list.push({ day: e.dateWorked.slice(0, 10), hours: e.hoursWorked });
      billableByContract.set(e.contractID, list);
    }

    const rows: PortalContractBlock[] = blocks.map((b) => {
      const used = (billableByContract.get(b.contractID) ?? [])
        .filter((e) => e.day >= b.startDate && e.day <= b.endDate)
        .reduce((sum, e) => sum + e.hours, 0);
      return {
        contractId: b.contractID,
        contractName: contractById.get(b.contractID)?.contractName ?? `Contract ${b.contractID}`,
        purchased: b.hours,
        used,
        remaining: b.hours - used,
        percentUsed: b.hours > 0 ? (used / b.hours) * 100 : 0,
        startDate: b.startDate,
        endDate: b.endDate,
      };
    });

    // Day-by-day billable hours inside the selected month only.
    const lastDay = Number(to.slice(-2));
    const perDay = new Map<string, number>();
    for (const e of entries) {
      if (e.isNonBillable) continue;
      const day = e.dateWorked.slice(0, 10);
      if (day < from || day > to) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + e.hoursWorked);
    }
    const dailyUsage = Array.from({ length: lastDay }, (_, i) => {
      const day = `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
      return { label: String(i + 1), value: Number((perDay.get(day) ?? 0).toFixed(2)) };
    });

    return {
      month,
      blocks: rows.sort((a, b) => b.percentUsed - a.percentUsed),
      dailyUsage,
      totalHoursInMonth: Number(
        dailyUsage.reduce((sum, d) => sum + d.value, 0).toFixed(2)
      ),
      unavailableReason: null,
    };
  } catch (err) {
    console.error("fetchPortalContractMonth failed", err);
    return empty("Contract data couldn't be loaded right now.");
  }
}

// ---------------------------------------------------------------------------
// Devices (cached NinjaOne)
// ---------------------------------------------------------------------------

export type PortalDevice = {
  id: number;
  systemName: string;
  nodeClass: string | null;
  isOffline: boolean | null;
  lastContact: string | null;
  osName: string | null;
  manufacturer: string | null;
  model: string | null;
  deviceCreatedAt: string | null;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
};

export type PortalDevices = {
  devices: PortalDevice[];
  lastSyncedAt: string | null;
  linked: boolean;
};

export async function fetchPortalDevices(session: PortalSession): Promise<PortalDevices> {
  if (session.client.ninjaoneOrganizationId == null) {
    return { devices: [], lastSyncedAt: null, linked: false };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ninjaone_devices")
    .select(
      "id, system_name, node_class, is_offline, last_contact, os_name, manufacturer, model, device_created_at, disk_total_bytes, disk_free_bytes, last_synced_at"
    )
    .eq("client_id", session.client.clientId)
    .order("system_name");

  if (error) {
    console.error("fetchPortalDevices failed", error);
    return { devices: [], lastSyncedAt: null, linked: true };
  }

  // Explicit row types throughout this file: `Database` is `any`
  // (src/lib/types.ts), so a Supabase result is `any` too and a bare
  // `.map((r) => ...)` is an implicit-any error under strict mode. Same
  // approach contract-hours.ts already takes.
  type DeviceRow = {
    id: number;
    system_name: string;
    node_class: string | null;
    is_offline: boolean | null;
    last_contact: string | null;
    os_name: string | null;
    manufacturer: string | null;
    model: string | null;
    device_created_at: string | null;
    disk_total_bytes: number | null;
    disk_free_bytes: number | null;
    last_synced_at: string;
  };
  const rows = (data ?? []) as DeviceRow[];
  return {
    linked: true,
    lastSyncedAt: rows.reduce<string | null>(
      (latest: string | null, r: DeviceRow) =>
        !latest || r.last_synced_at > latest ? r.last_synced_at : latest,
      null
    ),
    devices: rows.map((r: DeviceRow) => ({
      id: r.id,
      systemName: r.system_name,
      nodeClass: r.node_class,
      isOffline: r.is_offline,
      lastContact: r.last_contact,
      osName: r.os_name,
      manufacturer: r.manufacturer,
      model: r.model,
      deviceCreatedAt: r.device_created_at,
      diskTotalBytes: r.disk_total_bytes,
      diskFreeBytes: r.disk_free_bytes,
    })),
  };
}

// ---------------------------------------------------------------------------
// Microsoft 365 licences (cached)
// ---------------------------------------------------------------------------

export type PortalLicence = {
  skuPartNumber: string;
  consumedUnits: number;
  enabledUnits: number;
  suspendedUnits: number;
};

export type PortalLicences = {
  licences: PortalLicence[];
  lastSyncedAt: string | null;
  linked: boolean;
};

export async function fetchPortalLicences(session: PortalSession): Promise<PortalLicences> {
  if (!session.client.m365TenantId) {
    return { licences: [], lastSyncedAt: null, linked: false };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("m365_license_summary")
    .select("sku_part_number, consumed_units, enabled_units, suspended_units, last_synced_at")
    .eq("client_id", session.client.clientId)
    .order("consumed_units", { ascending: false });

  if (error) {
    console.error("fetchPortalLicences failed", error);
    return { licences: [], lastSyncedAt: null, linked: true };
  }

  type LicenceRow = {
    sku_part_number: string;
    consumed_units: number;
    enabled_units: number;
    suspended_units: number | null;
    last_synced_at: string;
  };
  const rows = (data ?? []) as LicenceRow[];
  return {
    linked: true,
    lastSyncedAt: rows[0]?.last_synced_at ?? null,
    licences: rows.map((r: LicenceRow) => ({
      skuPartNumber: r.sku_part_number,
      consumedUnits: r.consumed_units,
      enabledUnits: r.enabled_units,
      suspendedUnits: r.suspended_units ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Microsoft Secure Score (cached)
// ---------------------------------------------------------------------------

export type PortalSecureScore = {
  currentScore: number;
  maxScore: number;
  percent: number;
  lastSyncedAt: string | null;
  /** Top improvement opportunities, largest deficit first. */
  gaps: { title: string; category: string | null; deficit: number }[];
} | null;

export async function fetchPortalSecureScore(
  session: PortalSession
): Promise<PortalSecureScore> {
  if (!session.client.m365TenantId) return null;

  const admin = createAdminClient();
  const [{ data: score }, { data: gaps }] = await Promise.all([
    admin
      .from("m365_secure_score")
      .select("current_score, max_score, last_synced_at")
      .eq("client_id", session.client.clientId)
      .maybeSingle(),
    admin
      .from("m365_secure_score_gaps")
      .select("title, control_name, category, current_score, max_score")
      .eq("client_id", session.client.clientId),
  ]);

  type GapRow = {
    title: string | null;
    control_name: string;
    category: string | null;
    current_score: number | null;
    max_score: number | null;
  };

  if (!score || !score.max_score) return null;

  return {
    currentScore: score.current_score,
    maxScore: score.max_score,
    percent: Math.round((score.current_score / score.max_score) * 100),
    lastSyncedAt: score.last_synced_at ?? null,
    gaps: ((gaps ?? []) as GapRow[])
      .map((g: GapRow) => ({
        title: g.title ?? g.control_name,
        category: g.category,
        deficit: (g.max_score ?? 0) - (g.current_score ?? 0),
      }))
      .filter((g) => g.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Huntress agents (live — nothing is cached in Postgres for this vendor)
// ---------------------------------------------------------------------------

export type PortalHuntress = {
  agents: HuntressAgent[];
  linked: boolean;
  error: string | null;
};

export async function fetchPortalHuntress(session: PortalSession): Promise<PortalHuntress> {
  const orgId = session.client.huntressOrganizationId;
  // A null mapping means "hide the panel" — never "fetch unfiltered", which
  // is what omitting the argument to fetchHuntressAgents would do, and
  // would hand this client every other client's agents.
  if (orgId == null) return { agents: [], linked: false, error: null };

  const admin = createAdminClient();
  const creds = await getHuntressSettings(admin);
  if (!creds) return { agents: [], linked: true, error: "Not available right now." };

  try {
    return { agents: await fetchHuntressAgents(creds, orgId), linked: true, error: null };
  } catch (err) {
    console.error("fetchPortalHuntress failed", err);
    return { agents: [], linked: true, error: "Not available right now." };
  }
}

// ---------------------------------------------------------------------------
// Tickets: open snapshot (cached) + a monthly created trend (live)
// ---------------------------------------------------------------------------

export type PortalTickets = {
  open: { id: number; ticketNumber: string | null; title: string; status: string | null; priority: string | null; dueDate: string | null }[];
  lastSyncedAt: string | null;
  /** Tickets created per month over the trailing window. */
  createdByMonth: { label: string; value: number }[];
  linked: boolean;
};

const TICKET_TREND_MONTHS = 6;

export async function fetchPortalTickets(session: PortalSession): Promise<PortalTickets> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("autotask_tickets")
    // Explicitly NOT queue_name / assigned_resource_name — internal.
    .select("id, ticket_number, title, status, priority, due_date, last_synced_at")
    .eq("client_id", session.client.clientId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) console.error("fetchPortalTickets: cached read failed", error);
  type TicketRow = {
    id: number;
    ticket_number: string | null;
    title: string;
    status: string | null;
    priority: string | null;
    due_date: string | null;
    last_synced_at: string;
  };
  const rows = (data ?? []) as TicketRow[];

  const result: PortalTickets = {
    linked: session.client.autotaskCompanyId != null,
    lastSyncedAt: rows[0]?.last_synced_at ?? null,
    open: rows.map((r: TicketRow) => ({
      id: r.id,
      ticketNumber: r.ticket_number,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date,
    })),
    createdByMonth: [],
  };

  const companyId = session.client.autotaskCompanyId;
  if (companyId == null) return result;

  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return result;

  const months: string[] = [];
  for (let i = TICKET_TREND_MONTHS - 1; i >= 0; i--) months.push(shiftMonth(currentMonth(), -i));

  try {
    const { from } = monthBounds(months[0]);
    const { to } = monthBounds(months[months.length - 1]);
    const created = await fetchTicketsCreatedForCompany(
      settings.credentials,
      settings.zoneUrl,
      companyId,
      from,
      to
    );

    const counts = new Map<string, number>(months.map((m) => [m.slice(0, 7), 0]));
    for (const t of created) {
      const key = t.createDate.slice(0, 7);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    result.createdByMonth = months.map((m) => ({
      label: new Date(`${m}T00:00:00Z`).toLocaleString("en-GB", {
        month: "short",
        timeZone: "UTC",
      }),
      value: counts.get(m.slice(0, 7)) ?? 0,
    }));
  } catch (err) {
    console.error("fetchPortalTickets: trend fetch failed", err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tickets tab — a real filterable list, separate from the Overview stat card
// and trend above. Live-only, deliberately not sourced from the cached
// autotask_tickets table: that cache's sync only ever writes currently-open
// tickets (fetchOpenTicketsForCompany filters completedDate notExist), so it
// structurally cannot answer "show me closed tickets" — there's nothing
// closed in it to find.
// ---------------------------------------------------------------------------

export type PortalTicketListItem = AutotaskPortalTicketRow;

export type PortalTicketList = {
  tickets: PortalTicketListItem[];
  unavailableReason: string | null;
};

/** Both open and closed tickets whose creation or last activity falls
 * within lookbackDays — status filtering (open/closed/all) happens in the
 * page, not here, so this one call serves every status toggle without a
 * second Autotask round-trip. */
export async function fetchPortalTicketList(
  session: PortalSession,
  lookbackDays: number
): Promise<PortalTicketList> {
  const empty = (reason: string | null): PortalTicketList => ({ tickets: [], unavailableReason: reason });

  const companyId = session.client.autotaskCompanyId;
  if (companyId == null) return empty("This account isn't linked to Autotask yet.");

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return empty("Ticket data isn't available right now.");

  const clamped = Math.min(
    Math.max(Math.trunc(lookbackDays) || DEFAULT_LOOKBACK_DAYS, 1),
    MAX_LOOKBACK_DAYS
  );
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - clamped);

  try {
    const labels = await fetchTicketPicklists(settings.credentials, settings.zoneUrl);
    const rows = await fetchTicketsForCompanyInWindow(
      settings.credentials,
      settings.zoneUrl,
      companyId,
      since.toISOString(),
      labels
    );
    return {
      tickets: rows.sort((a, b) => (b.openedAt ?? "").localeCompare(a.openedAt ?? "")),
      unavailableReason: null,
    };
  } catch (err) {
    console.error("fetchPortalTicketList failed", err);
    return empty("Ticket data couldn't be loaded right now.");
  }
}

// ---------------------------------------------------------------------------
// Contracted services — the line-item list of what a client is contracted
// for (e.g. "Huntress - MDR x 3"), distinct from Contract hours' prepaid
// block burn-down above. Cached, not live — same table the staff-facing
// ClientAutotaskContractServices component already reads
// (autotask_contract_services), already scoped per-client via client_id.
// ---------------------------------------------------------------------------

export type PortalContractService = {
  id: number;
  contractName: string;
  contractStatus: string | null;
  serviceName: string;
  description: string | null;
  quantity: number | null;
};

export type PortalContractServices = {
  services: PortalContractService[];
  linked: boolean;
};

export async function fetchPortalContractServices(
  session: PortalSession
): Promise<PortalContractServices> {
  if (session.client.autotaskCompanyId == null) {
    return { services: [], linked: false };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("autotask_contract_services")
    .select("id, contract_name, contract_status, service_name, description, quantity")
    .eq("client_id", session.client.clientId)
    .order("service_name");

  if (error) {
    console.error("fetchPortalContractServices failed", error);
    return { services: [], linked: true };
  }

  type ContractServiceRow = {
    id: number;
    contract_name: string;
    contract_status: string | null;
    service_name: string;
    description: string | null;
    quantity: number | null;
  };
  const rows = (data ?? []) as ContractServiceRow[];

  return {
    linked: true,
    services: rows.map((r: ContractServiceRow) => ({
      id: r.id,
      contractName: r.contract_name,
      contractStatus: r.contract_status,
      serviceName: r.service_name,
      description: r.description,
      quantity: r.quantity,
    })),
  };
}
