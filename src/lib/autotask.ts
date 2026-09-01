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
    const res = await fetch(`${zoneUrl}/Companies/query?search=${encodeURIComponent(
      JSON.stringify({ filter: [{ op: "gte", field: "id", value: 0 }], MaxRecords: 1 })
    )}`, { headers: autotaskHeaders(creds) });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Autotask rejected the request (${res.status}): ${text}` };
    }
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
  const search = {
    filter: [{ op: "contains", field: "companyName", value: nameQuery }],
    MaxRecords: 20,
  };
  const url = `${zoneUrl}/Companies/query?search=${encodeURIComponent(JSON.stringify(search))}`;
  const res = await fetch(url, { headers: autotaskHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask company search failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return (json.items ?? []).map((c: { id: number; companyName: string }) => ({
    id: c.id,
    companyName: c.companyName,
  }));
}

export type AutotaskTicketRow = {
  id: number;
  ticket_number: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  queue_name: string | null;
  assigned_resource_name: string | null;
  due_date: string | null;
};

// Autotask's built-in ticket status picklist — 5 = Complete. Anything else
// counts as "open" for this list.
const CLOSED_STATUS_VALUE = 5;

/** Fetches this company's open tickets. Status/priority/queue/assignee come
 * back as raw picklist values from Autotask (numeric ids) — displayed as-is
 * since resolving them to labels needs a separate picklist-metadata call,
 * deferred until this proves useful. */
export async function fetchOpenTicketsForCompany(
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<AutotaskTicketRow[]> {
  const search = {
    filter: [
      { op: "eq", field: "companyID", value: companyId },
      { op: "noteq", field: "status", value: CLOSED_STATUS_VALUE },
    ],
    MaxRecords: 200,
  };
  const url = `${zoneUrl}/Tickets/query?search=${encodeURIComponent(JSON.stringify(search))}`;
  const res = await fetch(url, { headers: autotaskHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autotask ticket fetch failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  type RawTicket = {
    id: number;
    ticketNumber?: string;
    title: string;
    status?: number | string;
    priority?: number | string;
    queueID?: number | string;
    assignedResourceID?: number | string;
    dueDateTime?: string;
  };
  return (json.items ?? []).map((t: RawTicket) => ({
    id: t.id,
    ticket_number: t.ticketNumber ?? null,
    title: t.title,
    status: t.status != null ? String(t.status) : null,
    priority: t.priority != null ? String(t.priority) : null,
    queue_name: t.queueID != null ? String(t.queueID) : null,
    assigned_resource_name: t.assignedResourceID != null ? String(t.assignedResourceID) : null,
    due_date: t.dueDateTime ?? null,
  }));
}
