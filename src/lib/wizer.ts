// Minimal Wizer Training API client — no SDK, same plain-fetch style as
// autotask.ts/ninjaone.ts/huntress.ts/bitdefender.ts. Verified directly
// against Wizer's own readme.io API reference (unlike NinjaOne/Huntress/
// Bitdefender's docs sites, this one turned out to be plain fetchable —
// no JS-rendering blocker this time). Base URL is fixed (no region
// choice), auth is a single static custom header, and there's no OAuth
// token to mint or cache.
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type WizerCredentials = {
  apiKey: string;
};

const BASE_URL = "https://gateway.wizer-training.com/api/v1/external";

function wizerHeaders(creds: WizerCredentials): HeadersInit {
  assertAsciiHeaderValue(creds.apiKey, "Wizer API key");
  return { apiKey: creds.apiKey };
}

async function wizerGet(creds: WizerCredentials, path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: wizerHeaders(creds) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wizer API request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Confirms the credentials actually work via one cheap authenticated
 * call. Uses the Partner Portal's customers list (small page) rather than
 * /reports/metrics — since this integration is set up as one shared
 * partner-level key, listing customers both tests the connection and
 * doubles as the first real proof the "list every client company" call
 * works, matching the same choice made for Bitdefender's getCompaniesList. */
export async function testWizerConnection(creds: WizerCredentials): Promise<{ ok: boolean; error?: string }> {
  try {
    await wizerGet(creds, "/partner_portal/customers?limitPerPage=5&page=0&orderBy=companyName");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export type WizerCustomer = {
  companyId: string;
  companyName: string;
  email: string | null;
  parentCompany: string | null;
};

const PAGE_LIMIT = 200;
const PAGE_SAFETY_CAP = 20;

/** Every customer company visible to this partner API key — confirmed
 * against Wizer's own docs: GET /partner_portal/customers, page-number
 * pagination (not a token), itemsCount returned as a string. For a future
 * per-client mapping picker, the same role ninjaone_organization_id/
 * autotask_company_id/BitdefenderCompany play for their own integrations. */
export async function fetchWizerCustomers(creds: WizerCredentials): Promise<WizerCustomer[]> {
  type RawCustomer = { companyId: string; companyName: string; email?: string; parentCompany?: string };
  const customers: WizerCustomer[] = [];

  for (let page = 0; page < PAGE_SAFETY_CAP; page++) {
    const json: { customers?: RawCustomer[]; itemsCount?: string } = await wizerGet(
      creds,
      `/partner_portal/customers?limitPerPage=${PAGE_LIMIT}&page=${page}&orderBy=companyName`
    );
    const items = json.customers ?? [];
    for (const c of items) {
      customers.push({
        companyId: c.companyId,
        companyName: c.companyName,
        email: c.email ?? null,
        parentCompany: c.parentCompany ?? null,
      });
    }
    if (items.length < PAGE_LIMIT) break;
  }

  return customers;
}

export type WizerMetrics = {
  usersTotal: number;
  usersRegistered: number;
  usersNotRegistered: number;
  trainingCompleted: number;
  trainingAssigned: number;
  trainingInProgress: number;
  trainingNotStarted: number;
  gamingCompleted: number;
  gamingAssigned: number;
  phishingParticipated: number;
  phishingClicked: number;
  phishingReported: number;
};

/** One company's rollup across training, gaming, and phishing simulation
 * — confirmed against Wizer's own readme.io reference (GET
 * /reports/metrics?companyId=, a single call that covers everything this
 * app needs for a per-company SAT-style summary, unlike the separate
 * per-campaign dashboard endpoints). This is the same endpoint that
 * doubles nicely as "the" data source for security awareness training —
 * confirming SAT genuinely belongs to Wizer rather than Huntress, which
 * has no training concept at all. */
export async function fetchWizerMetrics(creds: WizerCredentials, companyId: string): Promise<WizerMetrics> {
  type RawMetrics = {
    users?: { registered?: number; notRegistered?: number; total?: number };
    training?: { summary?: { completed?: number; assigned?: number; inProgress?: number; notStarted?: number } };
    gaming?: { summary?: { completed?: number; assigned?: number; notStarted?: number } };
    phishing?: { summary?: { participated?: number; clicked?: number; reported?: number } };
  };
  const json: RawMetrics = await wizerGet(
    creds,
    `/reports/metrics?companyId=${encodeURIComponent(companyId)}`
  );

  return {
    usersTotal: json.users?.total ?? 0,
    usersRegistered: json.users?.registered ?? 0,
    usersNotRegistered: json.users?.notRegistered ?? 0,
    trainingCompleted: json.training?.summary?.completed ?? 0,
    trainingAssigned: json.training?.summary?.assigned ?? 0,
    trainingInProgress: json.training?.summary?.inProgress ?? 0,
    trainingNotStarted: json.training?.summary?.notStarted ?? 0,
    gamingCompleted: json.gaming?.summary?.completed ?? 0,
    gamingAssigned: json.gaming?.summary?.assigned ?? 0,
    phishingParticipated: json.phishing?.summary?.participated ?? 0,
    phishingClicked: json.phishing?.summary?.clicked ?? 0,
    phishingReported: json.phishing?.summary?.reported ?? 0,
  };
}
