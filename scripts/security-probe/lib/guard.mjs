// Four independent locks. Pointed at production, this script is an outage:
// it hammers auth endpoints and posts junk at every form. No single lock is
// trusted on its own.

const PRODUCTION_HOSTS = new Set([
  "ops.cgtechnologies.com",
  "www.cgtechnologies.com",
  "cgtechnologies.com",
]);

/** Parses --flag=value / --flag argv into a plain object. */
export function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [k, ...rest] = raw.slice(2).split("=");
    args[k] = rest.length ? rest.join("=") : true;
  }
  return args;
}

/**
 * Refuses to run unless ALL of these hold. Returns the validated target.
 *
 * 1. A target was given explicitly. No default — you cannot fat-finger your
 *    way to a live host.
 * 2. The host is not a known production host, by literal string.
 * 3. The host contains "staging". Belt to (2)'s braces: a new production
 *    alias nobody added to the set above still fails this.
 * 4. The DEPLOYMENT itself says it is staging. The app renders
 *    data-env-banner="true" only when NEXT_PUBLIC_ENV_LABEL is set, and
 *    production leaves it unset. This asks the running server what it is
 *    rather than trusting a URL string — the one lock a DNS mistake or a
 *    mispointed CNAME cannot fool.
 * 5. The operator typed the load acknowledgement. Friction on purpose.
 */
export async function requireStagingTarget(args) {
  const target = typeof args.target === "string" ? args.target.replace(/\/$/, "") : null;
  if (!target) {
    fail("No --target given. This script has no default target, deliberately.");
  }

  let url;
  try {
    url = new URL(target);
  } catch {
    fail(`--target is not a valid URL: ${target}`);
  }
  if (url.protocol !== "https:") fail("--target must be https.");

  const host = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) {
    fail(`${host} is a production host. This script must never point at production.`);
  }
  if (!host.includes("staging")) {
    fail(`${host} does not look like a staging host (no "staging" in the name). Refusing.`);
  }

  if (!args["i-understand-this-generates-load"]) {
    fail("Pass --i-understand-this-generates-load to confirm you mean to send abusive traffic.");
  }

  // Lock 4 — ask the deployment.
  process.stdout.write(`Confirming ${host} is a staging deployment... `);
  let res;
  try {
    res = await fetch(`${url.origin}/login`, { redirect: "manual" });
  } catch (err) {
    fail(`\nCould not reach ${url.origin}: ${err.message}`);
  }
  const html = await res.text();
  if (!html.includes('data-env-banner="true"')) {
    fail(
      `\n${host} did NOT render the staging env banner marker. Either it is not ` +
        `staging, or NEXT_PUBLIC_ENV_LABEL is unset there. Refusing to run.`
    );
  }
  console.log("confirmed.");
  return url.origin;
}

function fail(message) {
  console.error(`\n[REFUSED] ${message}\n`);
  process.exit(2);
}
