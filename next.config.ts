import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions default to a 1MB request body — well under the
      // 20MB file uploads this app allows (Timeline/project documents),
      // so those uploads were failing outright before reaching the
      // action's own size check. Some headroom above 20MB for
      // multipart/form-data's own boundary/field overhead.
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Without this, someone who types the hostname with no scheme
          // makes one plaintext request before the redirect to HTTPS, and
          // on a hostile network that request is interceptable — session
          // cookie and all. The header tells the browser never to try
          // plain HTTP for this host again.
          //
          // includeSubDomains covers staging.ops.cgtechnologies.com, which
          // already serves valid TLS. Note this is a one-way door for the
          // length of max-age: a browser that has seen it will refuse
          // plain HTTP to this host or any subdomain for a year, and the
          // only way back is to serve max-age=0 and wait for every client
          // to pick it up. Any FUTURE subdomain must therefore have a
          // valid certificate before it is first used.
          //
          // Deliberately no `preload`. That would submit the domain to a
          // list baked into browser binaries, which cannot be undone on
          // our own timetable at all.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },

          // Nothing in this app frames anything (verified: no <iframe>,
          // <embed> or <object> anywhere in src/), so DENY costs nothing
          // and removes clickjacking. It matters more than usual here
          // because /proposal-view/[token] and /quarterly-review-ack/[token]
          // are unauthenticated pages that take real actions — accept a
          // proposal, acknowledge a review — and an invisible frame over a
          // decoy page is exactly how those get clicked by someone who
          // never meant to.
          { key: "X-Frame-Options", value: "DENY" },

          // Stops a browser second-guessing Content-Type. The upload
          // buckets accept client documents and resumes, and a file served
          // back with a sniffed type is how a stored document becomes
          // stored XSS.
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Everything except the proposal pages, which take the stricter
        // policy below. Written as a negative match rather than letting
        // two rules both set Referrer-Policy, so there is no question of
        // which one wins.
        source: "/((?!proposal-view).*)",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
      {
        // The prospect-facing proposal page is authorised by the token in
        // its own URL, so that URL is the secret. Referrer-Policy stops it
        // leaking to any host the page links out to, and X-Robots-Tag keeps
        // a forwarded link out of search indexes — a proposal that turns up
        // in a Google result is a pricing leak.
        source: "/proposal-view/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
