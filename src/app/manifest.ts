import type { MetadataRoute } from "next";

// Special App Router file — Next serves this at /manifest.webmanifest and
// links it automatically, no metadata field needed. This is what makes
// Chrome/Edge/Android offer "Install app"; iOS Safari needs apple-icon.tsx
// too (see that file) since it ignores this manifest's icons for the
// "Add to Home Screen" flow.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CG Client Tracker",
    short_name: "CG Tracker",
    description:
      "Internal operations tracker for CG Technologies — client mailboxes, projects, touchpoints, and team task assignment.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#333333",
    icons: [
      {
        // Chrome's install criteria require both a 192px and 512px icon
        // present — omitting either silently blocks the install prompt.
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
