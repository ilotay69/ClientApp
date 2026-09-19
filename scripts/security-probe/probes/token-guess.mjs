import { timedFetch, median, randomUuid, looksLikeLeak } from "../lib/http.mjs";

/**
 * Token guessing against the unauthenticated token routes.
 *
 * What this proves and what it does NOT: the tokens are 122-bit v4 UUIDs
 * (proposals.access_token, quarterly_reviews.client_ack_token), so guessing
 * one is not a realistic threat and nothing here suggests otherwise. What
 * this actually tests is (a) that an unknown token leaks nothing an attacker
 * could use to tell "valid but not mine" from "does not exist" — no oracle —
 * and (b) that these endpoints stay up and generic under a burst.
 */
export async function run(origin, opts) {
  const count = opts.count ?? 20;
  const findings = [];
  const routes = [
    { name: "proposal-view", url: (t) => `${origin}/proposal-view/${t}` },
    { name: "review-ack", url: (t) => `${origin}/quarterly-review-ack/${t}` },
    { name: "brochure", url: (t) => `${origin}/proposal-view/${t}/brochure/${randomUuid()}` },
  ];

  for (const route of routes) {
    const sizes = [];
    const times = [];
    let leaked = null;
    for (let i = 0; i < count; i++) {
      const r = await timedFetch(route.url(randomUuid()));
      sizes.push(r.body.length);
      times.push(r.ms);
      const leak = looksLikeLeak(r.status, r.body);
      if (leak && !leaked) leaked = `${leak} (status ${r.status})`;
    }
    // Two different unknown tokens of equal length must give equal-sized
    // responses. A spread means the page renders something token-specific
    // for some of them — a possible existence oracle.
    const uniqueSizes = new Set(sizes);
    const spread = Math.max(...sizes) - Math.min(...sizes);

    if (leaked) {
      findings.push({ probe: "token-guess", route: route.name, severity: "high", detail: `leaked internals: ${leaked}` });
    }
    // Allow a tiny spread (a token echoed in the page differs only by its own
    // fixed length here, since all candidates are same-length UUIDs → 0).
    if (spread > 0) {
      findings.push({
        probe: "token-guess",
        route: route.name,
        severity: "medium",
        detail: `response size varied across ${uniqueSizes.size} values (spread ${spread} bytes) for equal-length unknown tokens — possible existence oracle`,
      });
    }
    console.log(
      `  ${route.name.padEnd(14)} ${count} unknown tokens · median ${median(times)}ms · ` +
        `size ${spread === 0 ? "constant" : `SPREAD ${spread}b`}${leaked ? " · LEAK" : ""}`
    );
  }

  return findings;
}
