import { timedFetch, looksLikeLeak } from "../lib/http.mjs";

/**
 * Oversized and malformed input at every unauthenticated surface that takes
 * any. The assertion is uniform and strict: never a 500, never a stack
 * trace, never a raw Postgres or framework error, and the server stays up
 * for the next probe. A clean 4xx or a generic page is a pass.
 *
 * The login form and the MFA field are Next Server Actions, invoked with a
 * build-time action id embedded in the page rather than a stable URL, so
 * they are not fuzzed from here — the field-level caps on those paths are
 * unit-testable in the app instead, and the DB-write paths they reach
 * (auth_attempts) are covered by the password/mfa probes. This probe owns
 * the plain HTTP surface: the token routes and the export API.
 */
const PAYLOADS = [
  { name: "empty", value: "" },
  { name: "1KB", value: "A".repeat(1024) },
  { name: "1MB", value: "A".repeat(1024 * 1024) },
  { name: "null-bytes", value: "a\x00b\x00c" },
  { name: "crlf-injection", value: "x\r\nBcc: victim@example.com" },
  { name: "path-traversal", value: "../../../../etc/passwd" },
  { name: "rtl-override", value: "‮evil‬" },
  { name: "sql-metachars", value: "'; drop table proposals;--" },
  { name: "json-in-path", value: '{"$ne":null}' },
];

export async function run(origin) {
  const findings = [];
  let checks = 0;

  // Path-segment fuzzing: the token in a token route.
  for (const p of PAYLOADS) {
    const token = encodeURIComponent(p.value) || "empty";
    for (const path of [`/proposal-view/${token}`, `/quarterly-review-ack/${token}`]) {
      const r = await timedFetch(`${origin}${path}`);
      checks++;
      const leak = looksLikeLeak(r.status, r.body);
      if (leak) {
        findings.push({
          probe: "fuzz-fields",
          route: path.split("/")[1],
          severity: "high",
          detail: `payload "${p.name}" → ${leak}`,
        });
      }
    }
  }

  // Query-param fuzzing on the export API (section + format).
  for (const p of PAYLOADS) {
    const v = encodeURIComponent(p.value);
    for (const qs of [`section=${v}&format=csv`, `section=tickets&format=${v}`]) {
      const r = await timedFetch(`${origin}/api/portal/export?${qs}`);
      checks++;
      const leak = looksLikeLeak(r.status, r.body);
      if (leak) {
        findings.push({
          probe: "fuzz-fields",
          route: "api/portal/export",
          severity: "high",
          detail: `payload "${p.name}" → ${leak}`,
        });
      }
    }
  }

  // A genuinely large URL, to confirm nothing 500s on an oversized request
  // line rather than returning a clean 414/400.
  const big = await timedFetch(`${origin}/proposal-view/${"A".repeat(60000)}`);
  checks++;
  const bigLeak = looksLikeLeak(big.status, big.body);
  if (bigLeak) {
    findings.push({ probe: "fuzz-fields", route: "proposal-view", severity: "medium", detail: `60KB path → ${bigLeak}` });
  }

  console.log(`  ${checks} malformed requests sent · ${findings.length} leak(s)`);
  return findings;
}
