// Domain diagnostics — DNS/MX/SPF/DMARC/DKIM via Node's built-in `dns`
// module (free, no API key, no external dependency) and registrar/
// expiration info via RDAP (the modern, standardized replacement for
// WHOIS — JSON over HTTPS, one authoritative IANA bootstrap file mapping
// each TLD to its RDAP server, rather than the old per-registrar WHOIS
// server mess). Nothing here is stored — every check is live.
import { promises as dnsPromises } from "dns";

export type DnsRecordSet = {
  a: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[][];
};

export type SpfResult = { found: boolean; record: string | null };
export type DmarcResult = { found: boolean; record: string | null; policy: string | null };
export type DkimSelectorResult = { selector: string; found: boolean; record: string | null };
export type SubdomainResult = { host: string; found: boolean; type: "CNAME" | "A" | null; target: string | null };
export type WhoisResult = {
  found: boolean;
  registrar: string | null;
  registeredAt: string | null;
  expiresAt: string | null;
  nameservers: string[];
  error?: string;
};

export type DomainHealthReport = {
  domain: string;
  dns: DnsRecordSet;
  spf: SpfResult;
  dmarc: DmarcResult;
  dkim: DkimSelectorResult[];
  subdomains: SubdomainResult[];
  whois: WhoisResult;
};

async function safeResolve<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function joinTxt(chunks: string[]): string {
  return chunks.join("");
}

async function fetchDnsRecords(domain: string): Promise<DnsRecordSet> {
  const [a, mx, ns, txt] = await Promise.all([
    safeResolve(() => dnsPromises.resolve4(domain), [] as string[]),
    safeResolve(() => dnsPromises.resolveMx(domain), [] as { exchange: string; priority: number }[]),
    safeResolve(() => dnsPromises.resolveNs(domain), [] as string[]),
    safeResolve(() => dnsPromises.resolveTxt(domain), [] as string[][]),
  ]);
  return { a, mx: [...mx].sort((x, y) => x.priority - y.priority), ns, txt };
}

function checkSpf(txtRecords: string[][]): SpfResult {
  const spf = txtRecords.map(joinTxt).find((r) => r.toLowerCase().startsWith("v=spf1"));
  return { found: Boolean(spf), record: spf ?? null };
}

async function checkDmarc(domain: string): Promise<DmarcResult> {
  const records = await safeResolve(() => dnsPromises.resolveTxt(`_dmarc.${domain}`), [] as string[][]);
  const dmarc = records.map(joinTxt).find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return { found: false, record: null, policy: null };
  const policy = dmarc.match(/p=([^;]+)/i)?.[1]?.trim() ?? null;
  return { found: true, record: dmarc, policy };
}

// DKIM has no discoverable selector — it's whatever the mail provider
// chose when the sending domain was set up. These cover the common ones
// (Microsoft 365, Google Workspace, and a handful of generic defaults);
// anything else needs to be checked by its actual selector by hand.
const COMMON_DKIM_SELECTORS = [
  "selector1",
  "selector2",
  "google",
  "s1",
  "s2",
  "k1",
  "dkim",
  "default",
  "smtp",
  "mail",
];

async function checkDkim(domain: string): Promise<DkimSelectorResult[]> {
  return Promise.all(
    COMMON_DKIM_SELECTORS.map(async (selector) => {
      const records = await safeResolve(
        () => dnsPromises.resolveTxt(`${selector}._domainkey.${domain}`),
        [] as string[][]
      );
      const record = records.map(joinTxt).find((r) => r.length > 0) ?? null;
      return { selector, found: Boolean(record), record };
    })
  );
}

// DNS has no "list every record for this domain" query — that's a zone
// transfer (AXFR), which essentially no public DNS host allows externally.
// So, same as DKIM selectors above, this checks a curated list of common/
// expected hostnames rather than claiming to be exhaustive. Checks CNAME
// first, then falls back to A, since a subdomain can be set up either way
// (M365's own names are always CNAMEs; "www" etc. can be either).
const COMMON_SUBDOMAINS = [
  "www",
  "mail",
  "webmail",
  "autodiscover",
  "owa",
  "remote",
  "vpn",
  "ftp",
  "cpanel",
  "sip",
  "lyncdiscover",
  "enterpriseregistration",
  "enterpriseenrollment",
  "msoid",
];

async function checkSubdomain(host: string, domain: string): Promise<SubdomainResult> {
  const fqdn = `${host}.${domain}`;
  const cname = await safeResolve(() => dnsPromises.resolveCname(fqdn), [] as string[]);
  if (cname.length > 0) return { host, found: true, type: "CNAME", target: cname[0] };

  const a = await safeResolve(() => dnsPromises.resolve4(fqdn), [] as string[]);
  if (a.length > 0) return { host, found: true, type: "A", target: a.join(", ") };

  return { host, found: false, type: null, target: null };
}

async function checkCommonSubdomains(domain: string): Promise<SubdomainResult[]> {
  return Promise.all(COMMON_SUBDOMAINS.map((host) => checkSubdomain(host, domain)));
}

const IANA_RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

async function findRdapBaseUrl(tld: string): Promise<string | null> {
  const res = await fetch(IANA_RDAP_BOOTSTRAP_URL);
  if (!res.ok) return null;
  const json = await res.json();
  const services = (json?.services ?? []) as [string[], string[]][];
  const entry = services.find(([tlds]) => tlds.includes(tld));
  return entry?.[1]?.[0] ?? null;
}

type RdapVcardEntry = [string, unknown, string, ...unknown[]];

function extractRegistrar(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null;
  const registrar = entities.find(
    (e): e is { roles?: string[]; vcardArray?: unknown; handle?: string } =>
      typeof e === "object" && e !== null && Array.isArray((e as { roles?: unknown }).roles) &&
      ((e as { roles: string[] }).roles.includes("registrar"))
  );
  if (!registrar) return null;

  const vcard = Array.isArray(registrar.vcardArray) ? registrar.vcardArray[1] : null;
  if (Array.isArray(vcard)) {
    const fnEntry = (vcard as RdapVcardEntry[]).find((v) => v[0] === "fn");
    if (fnEntry && typeof fnEntry[3] === "string") return fnEntry[3];
  }
  return registrar.handle ?? null;
}

/** Registrar/expiration/nameservers via RDAP — the IANA bootstrap points
 * at the authoritative server for the domain's TLD, no registrar-specific
 * WHOIS server list to maintain. */
async function checkWhois(domain: string): Promise<WhoisResult> {
  const empty = { found: false, registrar: null, registeredAt: null, expiresAt: null, nameservers: [] };
  const tld = domain.split(".").pop()?.toLowerCase();
  if (!tld) return { ...empty, error: "Not a valid domain." };

  try {
    const base = await findRdapBaseUrl(tld);
    if (!base) return { ...empty, error: `No RDAP server known for .${tld}.` };

    const url = `${base.replace(/\/+$/, "")}/domain/${domain}`;
    const res = await fetch(url, { headers: { Accept: "application/rdap+json" } });
    if (!res.ok) {
      return { ...empty, error: res.status === 404 ? "Domain not found." : `RDAP lookup failed (${res.status}).` };
    }

    const json = await res.json();
    const events = (json?.events ?? []) as { eventAction?: string; eventDate?: string }[];
    const registeredAt = events.find((e) => e.eventAction === "registration")?.eventDate ?? null;
    const expiresAt = events.find((e) => e.eventAction === "expiration")?.eventDate ?? null;
    const nameservers = ((json?.nameservers ?? []) as { ldhName?: string }[])
      .map((n) => n.ldhName)
      .filter((n): n is string => Boolean(n));

    return {
      found: true,
      registrar: extractRegistrar(json?.entities),
      registeredAt,
      expiresAt,
      nameservers,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

/** Pulls the domain out of an email address, for pre-filling a client's
 * Domain Health check from their primary contact (or any other contact)
 * email — the app has no dedicated "domain" field on a client. */
export function extractDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

export async function checkDomainHealth(input: string): Promise<DomainHealthReport> {
  const domain = normalizeDomain(input);
  const [dns, dmarc, dkim, subdomains, whois] = await Promise.all([
    fetchDnsRecords(domain),
    checkDmarc(domain),
    checkDkim(domain),
    checkCommonSubdomains(domain),
    checkWhois(domain),
  ]);
  return { domain, dns, spf: checkSpf(dns.txt), dmarc, dkim, subdomains, whois };
}
