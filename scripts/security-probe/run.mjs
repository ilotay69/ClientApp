#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, requireStagingTarget } from "./lib/guard.mjs";
import { run as fuzzFields } from "./probes/fuzz-fields.mjs";
import { run as tokenGuess } from "./probes/token-guess.mjs";
import { run as passwordRate } from "./probes/password-rate.mjs";
import { run as mfaRate } from "./probes/mfa-rate.mjs";

const PROBES = [
  { name: "fuzz-fields", run: fuzzFields },
  { name: "token-guess", run: tokenGuess },
  { name: "password-rate", run: passwordRate },
  { name: "mfa-rate", run: mfaRate },
];

const args = parseArgs(process.argv.slice(2));

// The guard exits the process itself on any failed lock.
const origin = await requireStagingTarget(args);

// Counts default LOW. Supabase's auth limits are per PROJECT, so a heavy run
// locks out everyone else testing staging for the rest of the hour.
const count = args.count ? Math.min(Number(args.count), 200) : 20;
const only = typeof args.only === "string" ? args.only.split(",") : null;

console.log(`\nSecurity probe → ${origin}   (count=${count})\n`);

const allFindings = [];
for (const probe of PROBES) {
  if (only && !only.includes(probe.name)) continue;
  console.log(`▶ ${probe.name}`);
  try {
    const findings = await probe.run(origin, { count });
    allFindings.push(...findings);
  } catch (err) {
    console.log(`  ERROR running probe: ${err.message}`);
    allFindings.push({ probe: probe.name, severity: "error", detail: `probe crashed: ${err.message}` });
  }
  console.log("");
}

const blocking = allFindings.filter((f) => f.severity === "high" || f.severity === "error");
const report = {
  target: origin,
  ranAt: new Date().toISOString(),
  count,
  findings: allFindings,
  ok: blocking.length === 0,
};
const reportPath = join(tmpdir(), `security-probe-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log("─".repeat(60));
if (allFindings.length === 0) {
  console.log("No findings.");
} else {
  for (const f of allFindings) {
    console.log(`[${f.severity.toUpperCase()}] ${f.probe}${f.route ? ` (${f.route})` : ""}: ${f.detail}`);
  }
}
console.log(`\nReport: ${reportPath}`);
console.log(blocking.length ? `\nFAILED — ${blocking.length} blocking finding(s).` : "\nPASSED — no leaks or crashes.");
process.exit(blocking.length ? 1 : 0);
