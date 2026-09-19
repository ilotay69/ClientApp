/** Shared HTTP helpers for the probes. Nothing here retries — a probe wants
 * to see the raw behaviour, including a failure, not paper over it. */

export async function timedFetch(url, init = {}) {
  const started = performance.now();
  let status = 0;
  let body = "";
  let error = null;
  try {
    const res = await fetch(url, { redirect: "manual", ...init });
    status = res.status;
    body = await res.text();
  } catch (err) {
    error = err.message;
  }
  return { status, body, error, ms: Math.round(performance.now() - started) };
}

/** A response is a "leak" if it exposes internals to an unauthenticated
 * caller: a 500, a stack trace, a raw Postgres error, or a framework error
 * page. These are what the fuzz probe asserts never happen. */
export function looksLikeLeak(status, body) {
  if (status >= 500) return `status ${status}`;
  const b = (body || "").toLowerCase();
  const tells = [
    "at async ",
    "at Object.",
    ".ts:",
    "\n    at ",
    "syntaxerror",
    "typeerror:",
    "referenceerror",
    "unhandled",
    "econnrefused",
    "pg_",
    "postgres",
    "pgrst",
    "supabaseurl",
    "service_role",
    "duplicate key value",
    "violates ",
    "column \"",
    "relation \"",
  ];
  for (const t of tells) if (b.includes(t)) return `body contains "${t}"`;
  return null;
}

/** median of a numeric array */
export function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function percentile(xs, p) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A v4-shaped UUID, for token-guessing. crypto.randomUUID is fine here —
 * we are generating candidates, not securing anything. */
export const randomUuid = () => crypto.randomUUID();
