// Minimal Autotask REST API helpers. No SDK — plain fetch, mirroring the
// style of microsoft-graph.ts. Auth is three static headers (no OAuth), and
// every tenant has its own "zone" base URL that must be resolved once before
// any other call can be made.

import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import type { ProjectStatus } from "@/lib/types";

export type AutotaskCredentials = {
  username: string;
  secret: string;
  integrationCode: string;
};

function autotaskHeaders(creds: AutotaskCredentials) {
  assertAsciiHeaderValue(creds.integrationCode, "Autotask Integration Code");
  assertAsciiHeaderValue(creds.username, "Autotask Username");
  assertAsciiHeaderValue(creds.secret, "Autotask Secret");

  return {
    ApiIntegrationCode: creds.integrationCode,
    UserName: creds.username,
    Secret: creds.secret,
    "Content-Type": "application/json",
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Autotask's per-account concurrent-thread cap (as low as 3) can trip even
// when this app's own calls are serialized — other integrations/users on
// the same account count against it too. A 429 here is usually transient
// contention, not a real failure, so retry with backoff before giving up.
const MAX_THREAD_LIMIT_RETRIES = 4;

async function autotaskQuery(
  creds: AutotaskCredentials,
  zoneUrl: string,
  entity: string,
  search: Record<string, unknown>,
  attempt = 0
): Promise<unknown[]> {
  const url = `${zoneUrl}/${entity}/query?search=${encodeURIComponent(JSON.stringify(search))}`;
  const res = await fetch(url, { headers: autotaskHeaders(creds) });

  if (res.status === 429 && attempt < MAX_THREAD_LIMIT_RETRIES) {
    await sleep(1000 * (attempt + 1));
    return autotaskQuery(creds, zoneUrl, entity, search, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask ${entity} query failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.items ?? [];
}

/** Same as autotaskQuery, but follows pageDetails.nextPageUrl until
 * exhausted (or maxPages, as a safety cap) instead of returning just the
 * first page — confirmed against Autotask's own docs that a query response
 * always carries this pointer (a full URL, or null when there's no more).
 * Needed for a fetch that can genuinely exceed one page, like a month-wide
 * time entries backfill; the rest of this file's queries stay single-page,
 * since none of them expect enough rows to matter. */
async function autotaskQueryAllPages(
  creds: AutotaskCredentials,
  zoneUrl: string,
  entity: string,
  search: Record<string, unknown>,
  maxPages = 20
): Promise<unknown[]> {
  const results: unknown[] = [];
  let url: string | null = `${zoneUrl}/${entity}/query?search=${encodeURIComponent(JSON.stringify(search))}`;

  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url, { headers: autotaskHeaders(creds) });
    if (res.status === 429) {
      await sleep(1000);
      page--; // retry the same page rather than skipping it
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Autotask ${entity} query failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    results.push(...(json.items ?? []));
    url = json.pageDetails?.nextPageUrl ?? null;
  }

  return results;
}

/** Resolves the tenant's per-zone API base URL (for REST calls) and its
 * classic web-UI zone (for deep links, e.g. a quote's own quote.asp page —
 * that UI has no REST-accessible equivalent) — required first call,
 * unauthenticated, before any other Autotask request can be made. The two
 * zones use different hostname numbering (e.g. "webservices3" vs "ww3"),
 * so the web one can't be derived from the API one and must come from
 * this same response. */
export async function resolveZoneUrl(
  username: string
): Promise<{ zoneUrl: string; webUrl: string }> {
  const url = new URL("https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation");
  url.searchParams.set("user", username);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask zone lookup failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const zoneUrl = json.url as string | undefined;
  const webUrl = json.webUrl as string | undefined;
  if (!zoneUrl) throw new Error("Autotask zone lookup did not return a URL.");
  // zoneInformation returns the bare zone base (e.g.
  // "https://webservices3.autotask.net/atservicesrest/") with no version
  // segment — every other endpoint lives under /v1.0 on top of that.
  return {
    zoneUrl: `${zoneUrl.replace(/\/$/, "")}/v1.0`,
    webUrl: (webUrl ?? "").replace(/\/$/, ""),
  };
}

/** Resolves the zone, then makes one trivial authenticated call to confirm
 * the credentials actually work (not just that zone resolution succeeded). */
export async function testAutotaskConnection(
  creds: AutotaskCredentials
): Promise<{ ok: boolean; zoneUrl?: string; webUrl?: string; error?: string }> {
  try {
    const { zoneUrl, webUrl } = await resolveZoneUrl(creds.username);
    await autotaskQuery(creds, zoneUrl, "Companies", {
      filter: [{ op: "gte", field: "id", value: 0 }],
      MaxRecords: 1,
    });
    return { ok: true, zoneUrl, webUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type AutotaskCompany = { id: number; companyName: string };

/** Name search over active Companies only, for the client-mapping UI —
 * inactive/former companies shouldn't show up as mapping candidates. */
export async function searchAutotaskCompanies(
  creds: AutotaskCredentials,
  zoneUrl: string,
  nameQuery: string
): Promise<AutotaskCompany[]> {
  const items = (await autotaskQuery(creds, zoneUrl, "Companies", {
    filter: [
      { op: "contains", field: "companyName", value: nameQuery },
      { op: "eq", field: "isActive", value: true },
    ],
    MaxRecords: 20,
  })) as { id: number; companyName: string }[];
  return items.map((c) => ({
    id: c.id,
    companyName: c.companyName,
  }));
}

/** Every active Autotask company whose companyType is "Customer", for the
 * "add multiple clients" picker — paginated since a real book of business
 * can exceed one page. companyType's numeric values are resolved from this
 * tenant's own picklist (same reasoning as fetchTicketPicklists) rather
 * than hardcoded, since Autotask lets a tenant customize/reorder them. If
 * the tenant's picklist has no label matching "Customer" (unexpected, but
 * shouldn't hard-fail the picker), only the isActive filter is applied. */
export async function fetchActiveAutotaskCompanies(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<AutotaskCompany[]> {
  const fields = await fetchEntityFields(creds, zoneUrl, "Companies");
  const companyTypeMap = picklistMap(fields, "companyType");
  const customerValue = [...companyTypeMap.entries()].find(
    ([, label]) => label.trim().toLowerCase() === "customer"
  )?.[0];

  const filter: Record<string, unknown>[] = [{ op: "eq", field: "isActive", value: true }];
  if (customerValue !== undefined) {
    filter.push({ op: "eq", field: "companyType", value: customerValue });
  }

  const items = (await autotaskQueryAllPages(creds, zoneUrl, "Companies", {
    filter,
  })) as { id: number; companyName: string }[];
  return items
    .map((c) => ({ id: c.id, companyName: c.companyName }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export type AutotaskContact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

/** Active Contacts for one Autotask company, for the "add contacts from
 * Autotask" picker on a client's Contacts panel. */
export async function fetchContactsForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskContact[]> {
  type RawContact = {
    id: number;
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    phone?: string;
    title?: string;
  };
  const items = (await autotaskQuery(creds, zoneUrl, "Contacts", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "eq", field: "isActive", value: true },
    ],
    MaxRecords: 200,
  })) as RawContact[];

  return items
    .map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
      email: c.emailAddress?.trim() || null,
      phone: c.phone?.trim() || null,
      title: c.title?.trim() || null,
    }))
    .filter((c) => c.name);
}

export type AutotaskPrimaryContact = {
  name: string;
  email: string | null;
};

/** The one Contact Autotask allows to be flagged primaryContact=true for a
 * company (it enforces at most one per company, unsetting any previous
 * one) — this is a real designation, not a guess at "whichever contact
 * happens to be first". Null if the company has none set. */
export async function fetchPrimaryContactForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskPrimaryContact | null> {
  type RawContact = { firstName?: string; lastName?: string; emailAddress?: string };
  const items = (await autotaskQuery(creds, zoneUrl, "Contacts", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "eq", field: "primaryContact", value: true },
      { op: "eq", field: "isActive", value: true },
    ],
    MaxRecords: 1,
  })) as RawContact[];

  const raw = items[0];
  if (!raw) return null;
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  if (!name) return null;
  return { name, email: raw.emailAddress?.trim() || null };
}

export type PicklistLabelMaps = {
  status: Map<number, string>;
  priority: Map<number, string>;
  queue: Map<number, string>;
  sla: Map<number, string>;
};

type FieldInfo = {
  name: string;
  isPickList?: boolean;
  picklistValues?: { value: string; label: string; isActive?: boolean }[];
};

function picklistMap(fields: FieldInfo[], fieldName: string): Map<number, string> {
  const field = fields.find((f) => f.name === fieldName);
  const map = new Map<number, string>();
  for (const v of field?.picklistValues ?? []) {
    map.set(Number(v.value), v.label);
  }
  return map;
}

/** Raw field metadata for one entity type — the source both entityInformation
 * calls (Tickets, Contracts, ...) resolve their picklist labels from. */
async function fetchEntityFields(
  creds: AutotaskCredentials,
  zoneUrl: string,
  entity: string,
  attempt = 0
): Promise<FieldInfo[]> {
  const res = await fetch(`${zoneUrl}/${entity}/entityInformation/fields`, {
    headers: autotaskHeaders(creds),
  });

  if (res.status === 429 && attempt < MAX_THREAD_LIMIT_RETRIES) {
    await sleep(1000 * (attempt + 1));
    return fetchEntityFields(creds, zoneUrl, entity, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask ${entity} field info failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.fields ?? [];
}

/** Resolves the tenant's actual label text for the status/priority/queue
 * picklists on Tickets — these can be customized per tenant, so the labels
 * can't be hardcoded and must come from this call. Cheap to call once per
 * sync run (not per ticket, not per client). */
export async function fetchTicketPicklists(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<PicklistLabelMaps> {
  const fields = await fetchEntityFields(creds, zoneUrl, "Tickets");
  return {
    status: picklistMap(fields, "status"),
    priority: picklistMap(fields, "priority"),
    queue: picklistMap(fields, "queueID"),
    sla: picklistMap(fields, "serviceLevelAgreementID"),
  };
}

/** Same idea as fetchTicketPicklists, for the Contracts entity's status
 * picklist — needed to show a contract's real status text instead of a
 * numeric code. */
export async function fetchContractStatusLabels(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<Map<number, string>> {
  const fields = await fetchEntityFields(creds, zoneUrl, "Contracts");
  return picklistMap(fields, "status");
}

/** Batched name lookup for Resources (techs) referenced by id — e.g. a
 * ticket's assignedResourceID, or a note/time entry's resource id. One call
 * for the whole set of ids seen, not one call per reference. Some Autotask
 * API Users aren't granted read access to the Resources entity (a
 * per-tenant security-level setting) — that failure shouldn't take down
 * ticket sync/detail entirely, so this swallows the error and returns
 * whatever it has (nothing, if the call never succeeded); callers already
 * fall back to "Resource {id}" for any id missing from the map. */
export async function resolveResourceNames(
  creds: AutotaskCredentials,
  zoneUrl: string,
  resourceIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const uniqueIds = [...new Set(resourceIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return map;

  let items: unknown[];
  try {
    items = await autotaskQuery(creds, zoneUrl, "Resources", {
      filter: [{ op: "in", field: "id", value: uniqueIds }],
      MaxRecords: uniqueIds.length,
    });
  } catch (err) {
    console.error("Autotask Resources lookup failed — falling back to raw ids", err);
    return map;
  }
  for (const r of items as { id: number; firstName?: string; lastName?: string; userName?: string }[]) {
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.userName || `Resource ${r.id}`;
    map.set(r.id, name);
  }
  return map;
}

export type AutotaskTicketRow = {
  id: number;
  ticket_number: string | null;
  title: string;
  description: string | null;
  resolution: string | null;
  status: string | null;
  priority: string | null;
  queue_name: string | null;
  assigned_resource_name: string | null;
  due_date: string | null;
  opened_at: string | null;
  last_activity_at: string | null;
};

type RawTicket = {
  id: number;
  ticketNumber?: string;
  title: string;
  description?: string;
  resolution?: string;
  status?: number;
  priority?: number;
  queueID?: number;
  assignedResourceID?: number;
  dueDateTime?: string;
  createDate?: string;
  lastActivityDate?: string;
  completedDate?: string;
  serviceLevelAgreementID?: number;
};

/** Fetches this company's open tickets (completedDate is null — a real,
 * unambiguous field, rather than guessing at a "Complete" status id that
 * could differ per tenant). Status/priority/queue use the tenant-wide
 * picklist labels the caller resolved once up front (they don't depend on
 * which tickets come back); assignee names are resolved here, scoped to
 * just the resource ids seen in this company's tickets — that can't be
 * known ahead of the fetch, so it can't be pre-resolved by the caller. */
export async function fetchOpenTicketsForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number,
  labels: PicklistLabelMaps
): Promise<AutotaskTicketRow[]> {
  // A ticket tagged with the Project SLA already shows up as a Project
  // (see fetchProjectSlaTicketsForCompany below) — excluded here so it
  // doesn't also appear as a regular open ticket, which is exactly the
  // double-entry this whole Project-SLA setup was meant to avoid.
  const projectSlaId = resolveProjectSlaId(labels);

  const items = (await autotaskQuery(creds, zoneUrl, "Tickets", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "notExist", field: "completedDate" },
      ...(projectSlaId !== null
        ? [{ op: "noteq", field: "serviceLevelAgreementID", value: projectSlaId }]
        : []),
    ],
    MaxRecords: 200,
  })) as RawTicket[];

  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    items.map((t) => t.assignedResourceID).filter((id): id is number => id != null)
  );

  return items.map((t) => ({
    id: t.id,
    ticket_number: t.ticketNumber ?? null,
    title: t.title,
    description: t.description ?? null,
    resolution: t.resolution ?? null,
    status: t.status != null ? (labels.status.get(t.status) ?? String(t.status)) : null,
    priority: t.priority != null ? (labels.priority.get(t.priority) ?? String(t.priority)) : null,
    queue_name: t.queueID != null ? (labels.queue.get(t.queueID) ?? String(t.queueID)) : null,
    assigned_resource_name:
      t.assignedResourceID != null
        ? (resourceNames.get(t.assignedResourceID) ?? `Resource ${t.assignedResourceID}`)
        : null,
    due_date: t.dueDateTime ?? null,
    opened_at: t.createDate ?? null,
    last_activity_at: t.lastActivityDate ?? null,
  }));
}

// The SLA name that marks a ticket as project work in this account's
// Autotask — change here if it's ever renamed there. Matched
// case-insensitively against the tenant's actual SLA picklist labels.
export const PROJECT_SLA_LABEL = "Project SLA";

/** The numeric SLA id matching PROJECT_SLA_LABEL in this tenant's actual
 * picklist, or null if no SLA is named that (a normal state, not an
 * error — see fetchProjectSlaTicketsForCompany). */
function resolveProjectSlaId(labels: PicklistLabelMaps): number | null {
  const entry = [...labels.sla.entries()].find(
    ([, label]) => label.trim().toLowerCase() === PROJECT_SLA_LABEL.toLowerCase()
  );
  return entry ? entry[0] : null;
}

export type AutotaskProjectTicketRow = {
  source_autotask_ticket_id: number;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  target_end_date: string | null;
};

/** Autotask's ticket status labels are a tenant-specific picklist, not a
 * fixed set — matched by keyword rather than exact value so this doesn't
 * silently stop working the moment an account's wording differs
 * ("On Hold" vs "Waiting Customer" vs "Customer Hold", etc.). Falls back
 * to "active", the same status every Project-SLA ticket got before this
 * mapping existed. */
function mapAutotaskStatusToProjectStatus(label: string | null): ProjectStatus {
  if (!label) return "active";
  const l = label.toLowerCase();
  if (l.includes("cancel")) return "cancelled";
  if (l.includes("complete") || l.includes("closed") || l.includes("resolved")) return "completed";
  if (l.includes("hold") || l.includes("waiting")) return "on_hold";
  if (l.includes("new")) return "planning";
  return "active";
}

/** Open tickets tagged with the "Project SLA" service level agreement,
 * treated as this app's Projects instead of requiring a project to be
 * created by hand in both Autotask and here — one ticket becomes one
 * project. Only open ones (completedDate is null), same as
 * fetchOpenTicketsForCompany — once a ticket's completedDate is set, it
 * stops appearing here at all; syncProjectSlaProjects (autotask-sync.ts)
 * is what marks that project completed rather than deleting it. While a
 * ticket IS still open, its own status maps onto this app's project
 * status via mapAutotaskStatusToProjectStatus below (e.g. "Waiting
 * Customer" → on_hold), so status stays live, not stuck on "active".
 * Returns an empty list, not an error, if this tenant's SLA picklist has
 * no label matching PROJECT_SLA_LABEL — that's a normal state (the SLA
 * hasn't been applied to anything yet), not a failure. */
export async function fetchProjectSlaTicketsForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number,
  labels: PicklistLabelMaps
): Promise<AutotaskProjectTicketRow[]> {
  const slaId = resolveProjectSlaId(labels);
  if (slaId === null) return [];

  const items = (await autotaskQuery(creds, zoneUrl, "Tickets", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "eq", field: "serviceLevelAgreementID", value: slaId },
      { op: "notExist", field: "completedDate" },
    ],
    MaxRecords: 200,
  })) as RawTicket[];

  return items.map((t) => ({
    source_autotask_ticket_id: t.id,
    name: t.title,
    status: mapAutotaskStatusToProjectStatus(
      t.status != null ? (labels.status.get(t.status) ?? null) : null
    ),
    start_date: t.createDate ?? null,
    target_end_date: t.dueDateTime ?? null,
  }));
}

export type AutotaskTicketNote = {
  id: number;
  title: string | null;
  description: string;
  createdAt: string;
  creatorName: string | null;
};

/** Live-fetch only — never persisted. Notes for one ticket, newest first. */
export async function fetchTicketNotes(
  creds: AutotaskCredentials,
  zoneUrl: string,
  ticketId: number
): Promise<AutotaskTicketNote[]> {
  const items = await autotaskQuery(creds, zoneUrl, "TicketNotes", {
    filter: [{ op: "eq", field: "ticketID", value: ticketId }],
    MaxRecords: 100,
  });

  type RawNote = {
    id: number;
    title?: string;
    description: string;
    createDateTime: string;
    creatorResourceID?: number;
  };
  const raw = items as RawNote[];
  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    raw.map((n) => n.creatorResourceID).filter((id): id is number => id != null)
  );

  return raw
    .map((n) => ({
      id: n.id,
      title: n.title ?? null,
      description: n.description,
      createdAt: n.createDateTime,
      creatorName: n.creatorResourceID != null ? (resourceNames.get(n.creatorResourceID) ?? null) : null,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export type AutotaskTimeEntry = {
  id: number;
  dateWorked: string;
  hoursWorked: number | null;
  summaryNotes: string | null;
  resourceName: string | null;
};

/** Live-fetch only — never persisted. Billable work log ("charges") for one
 * ticket, newest first. */
export async function fetchTicketTimeEntries(
  creds: AutotaskCredentials,
  zoneUrl: string,
  ticketId: number
): Promise<AutotaskTimeEntry[]> {
  const items = await autotaskQuery(creds, zoneUrl, "TimeEntries", {
    filter: [{ op: "eq", field: "ticketID", value: ticketId }],
    MaxRecords: 100,
  });

  type RawTimeEntry = {
    id: number;
    dateWorked: string;
    hoursWorked?: number;
    summaryNotes?: string;
    resourceID?: number;
  };
  const raw = items as RawTimeEntry[];
  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    raw.map((e) => e.resourceID).filter((id): id is number => id != null)
  );

  return raw
    .map((e) => ({
      id: e.id,
      dateWorked: e.dateWorked,
      hoursWorked: e.hoursWorked ?? null,
      summaryNotes: e.summaryNotes ?? null,
      resourceName: e.resourceID != null ? (resourceNames.get(e.resourceID) ?? null) : null,
    }))
    .sort((a, b) => (a.dateWorked < b.dateWorked ? 1 : -1));
}

export type AutotaskTicketTimeEntry = {
  id: number;
  ticketId: number;
  dateWorked: string;
  hoursWorked: number;
  resourceName: string | null;
  summaryNotes: string | null;
};

/** Billable time entries for a SET of tickets at once (chunked, not one
 * call per ticket like fetchTicketTimeEntries) — used by the client portal
 * to show what's actually been billed against each of a client's open
 * tickets. Filters out isNonBillable entries here rather than leaving that
 * to the caller, since nothing about a client-facing view makes sense with
 * internal (non-billable) time mixed in. */
export async function fetchTimeEntriesForTickets(
  creds: AutotaskCredentials,
  zoneUrl: string,
  ticketIds: number[]
): Promise<AutotaskTicketTimeEntry[]> {
  const uniqueIds = [...new Set(ticketIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return [];

  type RawTimeEntry = {
    id: number;
    ticketID?: number;
    dateWorked: string;
    hoursWorked?: number;
    summaryNotes?: string;
    resourceID?: number;
    isNonBillable?: boolean;
  };

  const raw: RawTimeEntry[] = [];
  for (let i = 0; i < uniqueIds.length; i += CONTRACT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CONTRACT_LOOKUP_CHUNK_SIZE);
    const items = (await autotaskQueryAllPages(creds, zoneUrl, "TimeEntries", {
      filter: [{ op: "in", field: "ticketID", value: chunk }],
    })) as RawTimeEntry[];
    raw.push(...items);
  }

  const billable = raw.filter((e) => !e.isNonBillable && e.ticketID != null);
  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    billable.map((e) => e.resourceID).filter((id): id is number => id != null)
  );

  return billable
    .map((e) => ({
      id: e.id,
      ticketId: e.ticketID as number,
      dateWorked: e.dateWorked,
      hoursWorked: e.hoursWorked ?? 0,
      resourceName: e.resourceID != null ? (resourceNames.get(e.resourceID) ?? null) : null,
      summaryNotes: e.summaryNotes ?? null,
    }))
    .sort((a, b) => (a.dateWorked < b.dateWorked ? 1 : -1));
}

export type AutotaskTimeEntryRange = {
  id: number;
  resourceID: number;
  hoursWorked: number;
  dateWorked: string;
  ticketID: number | null;
  taskID: number | null;
  summaryNotes: string | null;
  contractID: number | null;
  isNonBillable: boolean;
};

/** Account-wide time entries in a date range, across every resource and
 * ticket/task — not scoped to one ticket like fetchTicketTimeEntries.
 * Confirmed against Autotask's own field reference that TimeEntries can be
 * queried by dateWorked/resourceID without a ticketID filter. Paginated up
 * to autotaskQueryAllPages' safety cap (20 pages) — plenty for a month-wide
 * backfill for any team size this app is likely to see. */
export async function fetchTimeEntriesInRange(
  creds: AutotaskCredentials,
  zoneUrl: string,
  sinceISO: string,
  untilISO: string
): Promise<AutotaskTimeEntryRange[]> {
  // Paginated (not the plain single-page autotaskQuery) — a single day is
  // never going to hit Autotask's page size, but a month-wide backfill
  // easily can for a team of any real size, and silently truncating that
  // would produce an undercounted, misleading result.
  const items = await autotaskQueryAllPages(creds, zoneUrl, "TimeEntries", {
    filter: [
      { op: "gte", field: "dateWorked", value: sinceISO },
      { op: "lte", field: "dateWorked", value: untilISO },
    ],
  });

  type RawTimeEntry = {
    id: number;
    resourceID: number;
    hoursWorked?: number;
    dateWorked: string;
    ticketID?: number;
    taskID?: number;
    summaryNotes?: string;
    contractID?: number;
    isNonBillable?: boolean;
  };
  return (items as RawTimeEntry[])
    .filter((e) => e.hoursWorked != null)
    .map((e) => ({
      id: e.id,
      resourceID: e.resourceID,
      hoursWorked: e.hoursWorked as number,
      dateWorked: e.dateWorked,
      ticketID: e.ticketID ?? null,
      taskID: e.taskID ?? null,
      summaryNotes: e.summaryNotes ?? null,
      contractID: e.contractID ?? null,
      isNonBillable: e.isNonBillable ?? false,
    }));
}

export type AutotaskContractBlock = {
  id: number;
  contractID: number;
  hours: number;
  startDate: string;
  endDate: string;
};

/** Contract Blocks currently in effect (today falls within startDate/
 * endDate) — the prepaid-hours allotment for a Block Hours contract.
 * Account-wide, not scoped to one company: the caller maps contractID ->
 * company via fetchContractsByIds below. There's no "hours used" field on
 * this entity (confirmed against Autotask's own field reference) —
 * consumption has to be computed from TimeEntries.contractID separately. */
export async function fetchActiveContractBlocks(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<AutotaskContractBlock[]> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const items = (await autotaskQueryAllPages(creds, zoneUrl, "ContractBlocks", {
    filter: [
      { op: "lte", field: "startDate", value: todayStr },
      { op: "gte", field: "endDate", value: todayStr },
    ],
  })) as { id: number; contractID: number; hours?: number; startDate: string; endDate: string }[];

  return items
    .filter((b) => b.hours != null)
    .map((b) => ({
      id: b.id,
      contractID: b.contractID,
      hours: b.hours as number,
      startDate: b.startDate,
      endDate: b.endDate,
    }));
}

export type AutotaskContractSummary = { id: number; contractName: string; companyID: number };

const CONTRACT_LOOKUP_CHUNK_SIZE = 200;

/** Batched lookup for Contracts by id (chunked the same way
 * resolveTicketCompanyIds is, for the same reason — a long "in" filter
 * can 404 on a URL-length limit). Used to map a Contract Block's
 * contractID to the client it belongs to. */
export async function fetchContractsByIds(
  creds: AutotaskCredentials,
  zoneUrl: string,
  contractIds: number[]
): Promise<AutotaskContractSummary[]> {
  const uniqueIds = [...new Set(contractIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return [];

  const results: AutotaskContractSummary[] = [];
  for (let i = 0; i < uniqueIds.length; i += CONTRACT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CONTRACT_LOOKUP_CHUNK_SIZE);
    try {
      const items = (await autotaskQueryAllPages(creds, zoneUrl, "Contracts", {
        filter: [{ op: "in", field: "id", value: chunk }],
      })) as { id: number; contractName?: string; companyID: number }[];
      for (const c of items) {
        results.push({ id: c.id, contractName: c.contractName ?? `Contract ${c.id}`, companyID: c.companyID });
      }
    } catch (err) {
      console.error(
        `Autotask Contracts lookup failed for a batch of ${chunk.length} contracts`,
        err
      );
    }
  }
  return results;
}

/** Every Contract belonging to one company, whatever its status.
 *
 * Deliberately unlike fetchContractServicesForCompany, which keeps only
 * contracts whose status label is exactly "active" — that's right for "what
 * is this client paying for today", but it makes any view of a *past* month
 * come back empty once a contract has ended. The client portal steps
 * backwards through months, so it needs the unfiltered list and decides
 * relevance by date instead. */
export async function fetchContractsForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskContractSummary[]> {
  const items = (await autotaskQueryAllPages(creds, zoneUrl, "Contracts", {
    filter: [{ op: "eq", field: "companyID", value: companyId }],
  })) as { id: number; contractName?: string; companyID: number }[];

  return items.map((c) => ({
    id: c.id,
    contractName: c.contractName ?? `Contract ${c.id}`,
    companyID: c.companyID,
  }));
}

/** Contract blocks belonging to the given contracts that OVERLAP a date
 * range, i.e. `startDate <= to and endDate >= from`.
 *
 * fetchActiveContractBlocks hardcodes today into both bounds, so it can only
 * ever answer "what's live right now" — ask it about last month and it
 * returns nothing. Parameterising the bounds as an overlap test is what makes
 * stepping backwards and forwards through months possible. Scoped to specific
 * contract ids so a portal request never pulls another client's blocks back
 * in the first place. */
export async function fetchContractBlocksForContractsInRange(
  creds: AutotaskCredentials,
  zoneUrl: string,
  contractIds: number[],
  fromISO: string,
  toISO: string
): Promise<AutotaskContractBlock[]> {
  const uniqueIds = [...new Set(contractIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return [];

  const blocks: AutotaskContractBlock[] = [];
  for (let i = 0; i < uniqueIds.length; i += CONTRACT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CONTRACT_LOOKUP_CHUNK_SIZE);
    const items = (await autotaskQueryAllPages(creds, zoneUrl, "ContractBlocks", {
      filter: [
        { op: "in", field: "contractID", value: chunk },
        { op: "lte", field: "startDate", value: toISO },
        { op: "gte", field: "endDate", value: fromISO },
      ],
    })) as { id: number; contractID: number; hours?: number; startDate: string; endDate: string }[];

    for (const b of items) {
      if (b.hours == null) continue;
      blocks.push({
        id: b.id,
        contractID: b.contractID,
        hours: b.hours,
        startDate: b.startDate,
        endDate: b.endDate,
      });
    }
  }
  return blocks;
}

/** Time entries in a date range, restricted to specific contracts.
 *
 * TimeEntries carries no companyID of its own, so contractID is how per-client
 * consumption gets scoped. The alternative — fetchTimeEntriesInRange, which is
 * account-wide — would mean pulling every client's time to display one
 * client's, which is both slow and a payload waiting to leak. */
export async function fetchTimeEntriesForContracts(
  creds: AutotaskCredentials,
  zoneUrl: string,
  contractIds: number[],
  sinceISO: string,
  untilISO: string
): Promise<AutotaskTimeEntryRange[]> {
  const uniqueIds = [...new Set(contractIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return [];

  type RawTimeEntry = {
    id: number;
    resourceID: number;
    hoursWorked?: number;
    dateWorked: string;
    ticketID?: number;
    taskID?: number;
    summaryNotes?: string;
    contractID?: number;
    isNonBillable?: boolean;
  };

  const entries: AutotaskTimeEntryRange[] = [];
  for (let i = 0; i < uniqueIds.length; i += CONTRACT_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CONTRACT_LOOKUP_CHUNK_SIZE);
    const items = (await autotaskQueryAllPages(creds, zoneUrl, "TimeEntries", {
      filter: [
        { op: "in", field: "contractID", value: chunk },
        { op: "gte", field: "dateWorked", value: sinceISO },
        { op: "lte", field: "dateWorked", value: untilISO },
      ],
    })) as RawTimeEntry[];

    for (const e of items) {
      entries.push({
        id: e.id,
        resourceID: e.resourceID,
        hoursWorked: e.hoursWorked ?? 0,
        dateWorked: e.dateWorked,
        ticketID: e.ticketID ?? null,
        taskID: e.taskID ?? null,
        summaryNotes: e.summaryNotes ?? null,
        contractID: e.contractID ?? null,
        isNonBillable: e.isNonBillable ?? false,
      });
    }
  }
  return entries;
}

type RawOpenTicket = {
  id: number;
  title: string;
  companyID: number;
  queueID?: number;
  assignedResourceID?: number;
  dueDateTime?: string;
  createDate?: string;
};

export type AutotaskOpenTicketRow = {
  id: number;
  title: string;
  companyID: number;
  queueName: string | null;
  assignedResourceName: string | null;
  dueDate: string | null;
  createdAt: string | null;
};

/** Every open ticket account-wide (completedDate is null), not scoped to
 * one company like fetchOpenTicketsForCompany — used for an aging/overdue
 * view across the whole book of business. Paginated: a healthy MSP's
 * total open-ticket count can exceed one page easily. */
export async function fetchAllOpenTickets(
  creds: AutotaskCredentials,
  zoneUrl: string,
  labels: PicklistLabelMaps
): Promise<AutotaskOpenTicketRow[]> {
  const items = (await autotaskQueryAllPages(creds, zoneUrl, "Tickets", {
    filter: [{ op: "notExist", field: "completedDate" }],
  })) as RawOpenTicket[];

  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    items.map((t) => t.assignedResourceID).filter((id): id is number => id != null)
  );

  return items.map((t) => ({
    id: t.id,
    title: t.title,
    companyID: t.companyID,
    queueName: t.queueID != null ? (labels.queue.get(t.queueID) ?? String(t.queueID)) : null,
    assignedResourceName:
      t.assignedResourceID != null
        ? (resourceNames.get(t.assignedResourceID) ?? `Resource ${t.assignedResourceID}`)
        : null,
    dueDate: t.dueDateTime ?? null,
    createdAt: t.createDate ?? null,
  }));
}

/** Batched companyID lookup for Tickets referenced by id from time entries
 * — used to attribute a time entry to a client via the ticket's company,
 * since TimeEntries itself carries no client/company reference. Same
 * resilience posture as resolveResourceNames/resolveServiceNames: some
 * API Users may lack read access, so a failure here degrades to "unknown
 * client" for those entries rather than failing the whole sync. */
const TICKET_LOOKUP_CHUNK_SIZE = 200;

export async function resolveTicketCompanyIds(
  creds: AutotaskCredentials,
  zoneUrl: string,
  ticketIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const uniqueIds = [...new Set(ticketIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return map;

  // Chunked, not one query with every id in an "in" filter — a 90-day,
  // account-wide time-entries pull can easily reference many hundreds of
  // distinct tickets, and the URL-encoded JSON search param gets long
  // enough that Autotask (or a proxy in front of it) starts 404ing with a
  // generic HTML error page instead of a real API error. Bounded batches
  // avoid that regardless of how many tickets exist, and one bad batch
  // (network hiccup, etc.) no longer wipes out attribution for every
  // other ticket — it just degrades to "unknown client" for that batch.
  for (let i = 0; i < uniqueIds.length; i += TICKET_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + TICKET_LOOKUP_CHUNK_SIZE);
    try {
      const items = (await autotaskQueryAllPages(creds, zoneUrl, "Tickets", {
        filter: [{ op: "in", field: "id", value: chunk }],
      })) as { id: number; companyID?: number }[];
      for (const t of items) {
        if (t.companyID != null) map.set(t.id, t.companyID);
      }
    } catch (err) {
      console.error(
        `Autotask Tickets company lookup failed for a batch of ${chunk.length} tickets — those entries will show no client`,
        err
      );
    }
  }

  return map;
}

/** Batched name lookup for Services (Autotask's own service catalog)
 * referenced by id from ContractServices rows. Same resilience posture as
 * resolveResourceNames — some API Users may lack read access to this
 * entity too, so a failure here shouldn't take down the whole sync. */
async function resolveServiceNames(
  creds: AutotaskCredentials,
  zoneUrl: string,
  serviceIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const uniqueIds = [...new Set(serviceIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return map;

  try {
    const items = (await autotaskQuery(creds, zoneUrl, "Services", {
      filter: [{ op: "in", field: "id", value: uniqueIds }],
      MaxRecords: uniqueIds.length,
    })) as { id: number; name?: string }[];
    for (const s of items) {
      map.set(s.id, s.name || `Service ${s.id}`);
    }
  } catch (err) {
    console.error("Autotask Services lookup failed — falling back to description-derived titles", err);
  }

  return map;
}

/** A short, single-line stand-in for a service's real name, used only when
 * resolveServiceNames couldn't resolve it — the invoice/internal
 * description usually reads like a title anyway (Autotask returns the
 * "standard invoice description" from Admin when a contract service is
 * configured to use it), so this beats a bare "Service {id}". */
function titleFromDescription(description: string): string {
  const firstLine = description.split("\n")[0].trim();
  const MAX = 80;
  return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine;
}

export type AutotaskContractService = {
  id: number;
  contract_id: number;
  contract_name: string;
  contract_status: string | null;
  service_id: number;
  service_name: string;
  description: string | null;
  quantity: number | null;
};

/** Current unit count for a set of ContractServices rows, via
 * ContractServiceUnits — a service can have several unit rows over time
 * (one per billing period), so this picks whichever period covers today,
 * falling back to the most recent period if none matches exactly. Same
 * resilience posture as resolveResourceNames/resolveServiceNames: some API
 * Users may lack read access to this entity, so a failure here shouldn't
 * take down the whole sync. */
async function resolveContractServiceQuantities(
  creds: AutotaskCredentials,
  zoneUrl: string,
  contractServiceIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const uniqueIds = [...new Set(contractServiceIds)].filter((id) => Number.isFinite(id));
  if (uniqueIds.length === 0) return map;

  type RawUnit = { contractServiceID: number; units: number; startDate: string; endDate: string };
  let items: RawUnit[];
  try {
    items = (await autotaskQuery(creds, zoneUrl, "ContractServiceUnits", {
      filter: [{ op: "in", field: "contractServiceID", value: uniqueIds }],
      MaxRecords: uniqueIds.length * 10,
    })) as RawUnit[];
  } catch (err) {
    console.error("Autotask ContractServiceUnits lookup failed — omitting quantity", err);
    return map;
  }

  const today = new Date().toISOString().slice(0, 10);
  const byContractService = new Map<number, RawUnit[]>();
  for (const u of items) {
    const list = byContractService.get(u.contractServiceID) ?? [];
    list.push(u);
    byContractService.set(u.contractServiceID, list);
  }

  for (const [contractServiceId, units] of byContractService) {
    const current = units.find((u) => u.startDate.slice(0, 10) <= today && today <= u.endDate.slice(0, 10));
    const chosen = current ?? units.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
    if (chosen) map.set(contractServiceId, chosen.units);
  }
  return map;
}

/** A company's contracted services for its ACTIVE contracts only. One
 * Contracts query, then one ContractServices query per active contract
 * (typically very few per client), then batched Services and
 * ContractServiceUnits lookups. */
export async function fetchContractServicesForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskContractService[]> {
  const statusLabels = await fetchContractStatusLabels(creds, zoneUrl);

  type RawContract = { id: number; contractName: string; status?: number };
  const allContracts = (await autotaskQuery(creds, zoneUrl, "Contracts", {
    filter: [{ op: "eq", field: "companyID", value: companyId }],
    MaxRecords: 50,
  })) as RawContract[];

  const contracts = allContracts.filter((c) => {
    const label = c.status != null ? statusLabels.get(c.status) : null;
    // Exact match, not .includes — "Inactive" contains the substring
    // "active" too, which silently let inactive contracts through.
    return label?.toLowerCase() === "active";
  });
  if (contracts.length === 0) return [];

  type RawContractService = {
    id: number;
    contractID: number;
    serviceID: number;
    invoiceDescription?: string;
    internalDescription?: string;
  };
  // Sequential, not Promise.all — Autotask enforces a low concurrent-thread
  // cap per API user (as few as 3), shared across everything that account
  // is doing at once. One contract at a time avoids tripping it.
  const contractServices: RawContractService[] = [];
  for (const c of contracts) {
    const items = (await autotaskQuery(creds, zoneUrl, "ContractServices", {
      filter: [{ op: "eq", field: "contractID", value: c.id }],
      MaxRecords: 200,
    })) as RawContractService[];
    contractServices.push(...items);
  }

  const serviceNames = await resolveServiceNames(
    creds,
    zoneUrl,
    contractServices.map((cs) => cs.serviceID)
  );
  const quantities = await resolveContractServiceQuantities(
    creds,
    zoneUrl,
    contractServices.map((cs) => cs.id)
  );
  const contractsById = new Map(contracts.map((c) => [c.id, c]));

  return contractServices.map((cs) => {
    const contract = contractsById.get(cs.contractID);
    const description = cs.invoiceDescription || cs.internalDescription || null;
    const resolvedName = serviceNames.get(cs.serviceID);
    return {
      id: cs.id,
      contract_id: cs.contractID,
      contract_name: contract?.contractName ?? `Contract ${cs.contractID}`,
      contract_status:
        contract?.status != null ? (statusLabels.get(contract.status) ?? String(contract.status)) : null,
      service_id: cs.serviceID,
      service_name:
        resolvedName ?? (description ? titleFromDescription(description) : `Service ${cs.serviceID}`),
      description,
      quantity: quantities.get(cs.id) ?? null,
    };
  });
}

export type AutotaskQuote = {
  id: number;
  name: string;
  quoteNumber: number | null;
  approvalStatus: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
};

/** Quotes have no direct company filter — a Quote only carries an
 * opportunityID, so this goes through the client's Opportunities first.
 * No dollar amounts read or returned (this app never surfaces those) and
 * no PDF/portal link either — Autotask's Quotes entity doesn't have one;
 * callers build a deep link to the quote's own classic-UI page instead. */
export async function fetchQuotesForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskQuote[]> {
  type RawOpportunity = { id: number };
  const opportunities = (await autotaskQuery(creds, zoneUrl, "Opportunities", {
    filter: [{ op: "eq", field: "companyID", value: companyId }],
    MaxRecords: 200,
  })) as RawOpportunity[];
  if (opportunities.length === 0) return [];

  type RawQuote = {
    id: number;
    name: string;
    quoteNumber?: number;
    approvalStatus?: number;
    effectiveDate?: string;
    expirationDate?: string;
  };
  const items = (await autotaskQuery(creds, zoneUrl, "Quotes", {
    filter: [{ op: "in", field: "opportunityID", value: opportunities.map((o) => o.id) }],
    MaxRecords: 200,
  })) as RawQuote[];
  if (items.length === 0) return [];

  const fields = await fetchEntityFields(creds, zoneUrl, "Quotes");
  const approvalStatusLabels = picklistMap(fields, "approvalStatus");

  return items
    .map((q) => ({
      id: q.id,
      name: q.name,
      quoteNumber: q.quoteNumber ?? null,
      approvalStatus:
        q.approvalStatus != null ? (approvalStatusLabels.get(q.approvalStatus) ?? null) : null,
      effectiveDate: q.effectiveDate ?? null,
      expirationDate: q.expirationDate ?? null,
    }))
    .sort((a, b) => (b.effectiveDate ?? "").localeCompare(a.effectiveDate ?? ""));
}

/** The classic web UI's quote page — Autotask's REST API has nothing
 * equivalent to link to, so this is the only clickable way back to a
 * quote from outside Autotask itself. */
export function buildAutotaskQuoteUrl(webZoneUrl: string, quoteId: number): string {
  return `${webZoneUrl.replace(/\/$/, "")}/opportunity/quotes/quote.asp?QuoteID=${quoteId}`;
}

export type AutotaskTicketCreatedRow = { id: number; createDate: string };

/** Every ticket created for one company in a date range, regardless of
 * current status — unlike fetchOpenTicketsForCompany (open tickets only,
 * single page), this is for a volume-over-time trend, so a since-closed
 * ticket still needs to count in the week it was opened. Paginated: a
 * busy client over several months can exceed one page. */
export async function fetchTicketsCreatedForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number,
  sinceISO: string,
  untilISO: string
): Promise<AutotaskTicketCreatedRow[]> {
  const items = (await autotaskQueryAllPages(creds, zoneUrl, "Tickets", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "gte", field: "createDate", value: sinceISO },
      { op: "lte", field: "createDate", value: untilISO },
    ],
  })) as { id: number; createDate: string }[];
  return items.map((t) => ({ id: t.id, createDate: t.createDate }));
}

export type AutotaskPortalTicketRow = {
  id: number;
  ticketNumber: string | null;
  title: string;
  description: string | null;
  resolution: string | null;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  openedAt: string | null;
  lastActivityAt: string | null;
  // completedDate is null -> open. Same field fetchOpenTicketsForCompany
  // already relies on successfully for its own `notExist` filter.
  isOpen: boolean;
};

async function fetchTicketsForCompanySince(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number,
  field: "createDate" | "lastActivityDate",
  sinceISO: string
): Promise<RawTicket[]> {
  // Await first, then cast the resolved array — matches every other cast of
  // autotaskQueryAllPages's result in this file; casting the Promise type
  // itself (Promise<unknown[]> as Promise<RawTicket[]>) is unproven here.
  const items = await autotaskQueryAllPages(creds, zoneUrl, "Tickets", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "gte", field, value: sinceISO },
    ],
  });
  return items as RawTicket[];
}

/** Every ticket for one company — open AND closed — created or active in
 * the last N days, for the client portal's Tickets tab. Deliberately omits
 * queue_name/assigned_resource_name, same "internal, not the client's"
 * reasoning fetchPortalTickets in portal-data.ts already documents for the
 * cached table — skips resolveResourceNames entirely, one fewer API call.
 *
 * Two flat queries merged by id, not one grouped-OR query. Autotask's API
 * is documented to support a nested `{op:"or", items:[...]}` filter group,
 * which would do this in one round-trip — but nothing in this file has
 * ever exercised that grammar, and `search` is loosely typed enough
 * (`Record<string, unknown>`) that a mistake there would only surface as a
 * live 400 from Autotask, not a compile error. Given a provably safe
 * alternative exists (both queries here use filter shapes already proven
 * working elsewhere in this file), use it — costs one extra Autotask
 * round-trip per page load, uses nothing unverified. */
export async function fetchTicketsForCompanyInWindow(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number,
  sinceISO: string,
  labels: PicklistLabelMaps
): Promise<AutotaskPortalTicketRow[]> {
  const [byCreated, byActivity] = await Promise.all([
    fetchTicketsForCompanySince(creds, zoneUrl, companyId, "createDate", sinceISO),
    fetchTicketsForCompanySince(creds, zoneUrl, companyId, "lastActivityDate", sinceISO),
  ]);

  const byId = new Map<number, RawTicket>();
  for (const t of [...byCreated, ...byActivity]) byId.set(t.id, t);

  return [...byId.values()].map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber ?? null,
    title: t.title,
    description: t.description ?? null,
    resolution: t.resolution ?? null,
    status: t.status != null ? (labels.status.get(t.status) ?? String(t.status)) : null,
    priority: t.priority != null ? (labels.priority.get(t.priority) ?? String(t.priority)) : null,
    dueDate: t.dueDateTime ?? null,
    openedAt: t.createDate ?? null,
    lastActivityAt: t.lastActivityDate ?? null,
    isOpen: !t.completedDate,
  }));
}

export type AutotaskActiveResource = { id: number; name: string };

/** Every active (non-terminated) Resource — for a resource picker, not a
 * per-id lookup like resolveResourceNames. Some Autotask API Users lack
 * read access to this entity (a per-tenant security-level setting, same
 * caveat resolveResourceNames already documents) — swallowed here too,
 * returning whatever succeeded rather than failing the whole page. */
export async function fetchActiveResources(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<AutotaskActiveResource[]> {
  try {
    const items = (await autotaskQueryAllPages(creds, zoneUrl, "Resources", {
      filter: [{ op: "eq", field: "isActive", value: true }],
    })) as { id: number; firstName?: string; lastName?: string; userName?: string }[];
    return items
      .map((r) => ({
        id: r.id,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.userName || `Resource ${r.id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Autotask active Resources lookup failed", err);
    return [];
  }
}
