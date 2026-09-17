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
