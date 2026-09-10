// Client-safe constants only — no server-only imports (next/headers via
// supabase/server.ts, etc.) in this file, ever. lib/portal.ts re-exports
// these for server-side code to keep importing from one place, but a
// Client Component must import straight from here instead of from
// lib/portal — pulling in even one value export from a module that
// transitively depends on next/headers drags that whole dependency graph
// into the client bundle and fails the build ("You're importing a module
// that depends on 'next/headers'... available in Server Components").

/** Every portal page that can be individually granted/withheld per
 * client-portal sub-role (see client_portal_permissions, 081) — Overview
 * is deliberately not here, it's the one page every portal login can
 * always reach regardless of role, so there's never a zero-page dead end. */
export const PORTAL_PAGE_KEYS = ["tickets", "contracts", "devices", "security", "licences"] as const;
export type PortalPageKey = (typeof PORTAL_PAGE_KEYS)[number];

export type ClientPortalRole = "client_tech" | "client_manager" | "client_owner";

export const CLIENT_PORTAL_ROLE_LABELS: Record<ClientPortalRole, string> = {
  client_tech: "Client Tech",
  client_manager: "Client Manager",
  client_owner: "Client Owner",
};
