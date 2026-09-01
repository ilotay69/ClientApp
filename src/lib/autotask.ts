// Minimal Autotask REST API helpers. No SDK — plain fetch, mirroring the
// style of microsoft-graph.ts. Auth is three static headers (no OAuth), and
// every tenant has its own "zone" base URL that must be resolved once before
// any other call can be made.

export type AutotaskCredentials = {
  username: string;
  secret: string;
  integrationCode: string;
};

function autotaskHeaders(creds: AutotaskCredentials) {
  return {
    ApiIntegrationCode: creds.integrationCode,
    UserName: creds.username,
    Secret: creds.secret,
    "Content-Type": "application/json",
  };
}

async function autotaskQuery(
  creds: AutotaskCredentials,
  zoneUrl: string,
  entity: string,
  search: Record<string, unknown>
) {
  const url = `${zoneUrl}/${entity}/query?search=${encodeURIComponent(JSON.stringify(search))}`;
  const res = await fetch(url, { headers: autotaskHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask ${entity} query failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.items ?? [];
}

/** Resolves the tenant's per-zone API base URL — required first call,
 * unauthenticated, before any other Autotask request can be made. */
export async function resolveZoneUrl(username: string): Promise<string> {
  const url = new URL("https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation");
  url.searchParams.set("user", username);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask zone lookup failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const zoneUrl = json.url as string | undefined;
  if (!zoneUrl) throw new Error("Autotask zone lookup did not return a URL.");
  // zoneInformation returns the bare zone base (e.g.
  // "https://webservices3.autotask.net/atservicesrest/") with no version
  // segment — every other endpoint lives under /v1.0 on top of that.
  return `${zoneUrl.replace(/\/$/, "")}/v1.0`;
}

/** Resolves the zone, then makes one trivial authenticated call to confirm
 * the credentials actually work (not just that zone resolution succeeded). */
export async function testAutotaskConnection(
  creds: AutotaskCredentials
): Promise<{ ok: boolean; zoneUrl?: string; error?: string }> {
  try {
    const zoneUrl = await resolveZoneUrl(creds.username);
    await autotaskQuery(creds, zoneUrl, "Companies", {
      filter: [{ op: "gte", field: "id", value: 0 }],
      MaxRecords: 1,
    });
    return { ok: true, zoneUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type AutotaskCompany = { id: number; companyName: string };

/** Name search over Companies, for the client-mapping UI. */
export async function searchAutotaskCompanies(
  creds: AutotaskCredentials,
  zoneUrl: string,
  nameQuery: string
): Promise<AutotaskCompany[]> {
  const items = await autotaskQuery(creds, zoneUrl, "Companies", {
    filter: [{ op: "contains", field: "companyName", value: nameQuery }],
    MaxRecords: 20,
  });
  return items.map((c: { id: number; companyName: string }) => ({
    id: c.id,
    companyName: c.companyName,
  }));
}

export type PicklistLabelMaps = {
  status: Map<number, string>;
  priority: Map<number, string>;
  queue: Map<number, string>;
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

/** Resolves the tenant's actual label text for the status/priority/queue
 * picklists on Tickets — these can be customized per tenant, so the labels
 * can't be hardcoded and must come from this call. Cheap to call once per
 * sync run (not per ticket, not per client). */
export async function fetchTicketPicklists(
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<PicklistLabelMaps> {
  const res = await fetch(`${zoneUrl}/Tickets/entityInformation/fields`, {
    headers: autotaskHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask Tickets field info failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const fields: FieldInfo[] = json.fields ?? [];

  return {
    status: picklistMap(fields, "status"),
    priority: picklistMap(fields, "priority"),
    queue: picklistMap(fields, "queueID"),
  };
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
  const items: RawTicket[] = await autotaskQuery(creds, zoneUrl, "Tickets", {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "notExist", field: "completedDate" },
    ],
    MaxRecords: 200,
  });

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
