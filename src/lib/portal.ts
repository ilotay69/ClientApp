import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
// Re-exported so existing server-side callers can keep importing these
// from "@/lib/portal" unchanged — but a Client Component must import them
// from "@/lib/portal-roles" directly instead (see that file's own comment
// for why: this module transitively depends on next/headers).
import { PORTAL_PAGE_KEYS, type PortalPageKey, type ClientPortalRole } from "@/lib/portal-roles";
export { PORTAL_PAGE_KEYS, CLIENT_PORTAL_ROLE_LABELS } from "@/lib/portal-roles";
export type { PortalPageKey, ClientPortalRole } from "@/lib/portal-roles";

/** Which of PORTAL_PAGE_KEYS a given client-portal sub-role can see —
 * read via the service-role client, same reasoning as loadPortalClient:
 * a role='client' login has no direct table access under RLS at all. */
export async function fetchAllowedPortalPages(
  clientRole: ClientPortalRole
): Promise<Set<PortalPageKey>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_portal_permissions")
    .select("portal_page, enabled")
    .eq("client_role", clientRole);

  if (error) {
    console.error("fetchAllowedPortalPages failed", error);
    // Fails open to "everything allowed" rather than locking every client
    // out of their whole portal over a transient read error — the same
    // trade-off resolveResourceNames-style Autotask lookups already make
    // elsewhere in this app for a failed lookup.
    return new Set(PORTAL_PAGE_KEYS);
  }

  type Row = { portal_page: string; enabled: boolean };
  const allowed = new Set(
    ((data ?? []) as Row[])
      .filter((r) => r.enabled)
      .map((r) => r.portal_page)
      .filter((p): p is PortalPageKey => (PORTAL_PAGE_KEYS as readonly string[]).includes(p))
  );
  return allowed;
}

/** The vendor mappings a portal page needs, and nothing else.
 *
 * Note what is NOT here: `notes` and `owner_id` from the clients row are
 * internal, and portal reads go through the service-role client — which
 * bypasses column grants as well as RLS — so the only thing keeping internal
 * columns out of a customer's payload is the explicit select list in
 * loadPortalClient() below. Add fields here only when a panel needs them. */
export type PortalClient = {
  clientId: string;
  clientName: string;
  autotaskCompanyId: number | null;
  ninjaoneOrganizationId: number | null;
  m365TenantId: string | null;
  huntressOrganizationId: number | null;
};

/** A resolved, MFA-satisfied portal session. Every data helper takes THIS,
 * not a client id — so "I forgot to check the MFA state" is a type error at
 * the call site rather than a silent data leak. */
export type PortalSession = {
  state: "ok";
  client: PortalClient;
  email: string;
  /** True when a staff member is looking at a client's portal rather than the
   * client themselves. Portal pages are read-only, but anything that ever
   * writes must refuse when this is set. */
  isPreview: boolean;
  /** Meaningless during a staff preview (allowedPages is every page then,
   * regardless of this value) — only real for an actual client login. */
  clientRole: ClientPortalRole;
  /** Which of PORTAL_PAGE_KEYS this session may reach — always every page
   * during a staff preview, so staff auditing a client's portal are never
   * blocked by that client's own role restrictions. */
  allowedPages: Set<PortalPageKey>;
};

export type PortalContext =
  | { state: "unauthenticated" }
  /** Signed in, but not a portal user — staff with no ?preview= selected, or
   * a client row that has gone missing. Callers send these to "/". */
  | { state: "not_portal_user" }
  /** Still on a temp password (a brand-new login, or one just reset by
   * staff) — must set a real one before reaching the portal. Only returned
   * after MFA is satisfied (see getPortalContext): Supabase refuses a
   * password update at AAL1 once any verified factor exists. */
  | { state: "needs_password_change" }
  /** No TOTP factor yet: first login. */
  | { state: "needs_enrolment" }
  /** Has a verified TOTP factor but this session is still AAL1. */
  | { state: "needs_verification" }
  | PortalSession;

const PORTAL_CLIENT_COLUMNS =
  "id, name, autotask_company_id, ninjaone_organization_id, m365_tenant_id, huntress_organization_id";

async function loadPortalClient(clientId: string): Promise<PortalClient | null> {
  // Service role: after 065 a role='client' login has no read access to
  // `clients` at all, which is the point — the portal's scoping lives here in
  // server code, not in a policy a client could probe.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select(PORTAL_CLIENT_COLUMNS)
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    console.error("loadPortalClient: failed to read client", error);
    return null;
  }
  if (!data) return null;

  return {
    clientId: data.id,
    clientName: data.name,
    autotaskCompanyId: data.autotask_company_id ?? null,
    ninjaoneOrganizationId: data.ninjaone_organization_id ?? null,
    m365TenantId: data.m365_tenant_id ?? null,
    huntressOrganizationId: data.huntress_organization_id ?? null,
  };
}

/**
 * The single place a portal `client_id` may come from.
 *
 * For a portal login it is read off their own profile row — never from a URL,
 * a form field, or a JWT claim. A staff member may pass `previewClientId` to
 * look at what a client sees, and that is honoured ONLY after their role has
 * been confirmed as staff.
 *
 * Call this from every portal page AND every portal server action. A page
 * guard is not enough on its own: Server Actions are POST endpoints that run
 * independently of any layout or page render, and Supabase issues a perfectly
 * usable AAL1 session to a password-only sign-in even when the account has a
 * verified TOTP factor — MFA is advisory until something enforces it. Since
 * portal data is read with the service-role key, RLS cannot be that something.
 * This function is.
 *
 * It calls createClient() (and therefore cookies()) first, on purpose: that is
 * what marks the calling Server Component as dynamic. A portal page that read
 * only through createAdminClient() would touch no request state at all, and
 * Next would happily prerender it at build time — baking one client's data
 * into HTML served to every other client. Pages also set `force-dynamic`, but
 * this makes it structural rather than a convention someone forgets.
 */
export async function getPortalContext(previewClientId?: string): Promise<PortalContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, must_change_password, client_role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { state: "unauthenticated" };

  const role = profile.role as UserRole;

  if (role === "client") {
    if (!profile.client_id) return { state: "not_portal_user" };

    // MFA is mandatory for portal logins. currentLevel is read out of the
    // session JWT, so this is cheap enough to run on every action.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      // nextLevel === 'aal2' means a verified factor exists and this session
      // just hasn't stepped up yet; otherwise they've never enrolled.
      return aal?.nextLevel === "aal2"
        ? { state: "needs_verification" }
        : { state: "needs_enrolment" };
    }

    // Checked AFTER MFA, not before: Supabase itself refuses to update a
    // password at AAL1 once any verified factor exists ("AAL2 session is
    // required to update email or password when MFA is enabled") — so an
    // existing client who got a temp password from a reset has to step up
    // with their EXISTING authenticator first (needs_verification, above),
    // same as any other portal action. A brand-new login has no factor at
    // all yet, so it goes through needs_enrolment above instead — enrolling
    // (which verifies a code as part of the same flow) establishes AAL2 the
    // same way, and only then does this check run.
    if (profile.must_change_password) return { state: "needs_password_change" };

    const client = await loadPortalClient(profile.client_id);
    if (!client) return { state: "not_portal_user" };
    const clientRole = (profile.client_role as ClientPortalRole) ?? "client_owner";
    const allowedPages = await fetchAllowedPortalPages(clientRole);
    return { state: "ok", client, email: user.email ?? "", isPreview: false, clientRole, allowedPages };
  }

  // Staff preview. No MFA requirement here — staff sign-in is a separate
  // concern, and requiring AAL2 would lock out every current employee.
  // Every page is allowed regardless of role during a preview — a staff
  // member auditing a client's portal needs to see all of it, not just
  // whatever that client's own sub-role happens to be restricted to.
  if (isStaffRole(role)) {
    if (!previewClientId) return { state: "not_portal_user" };
    const client = await loadPortalClient(previewClientId);
    if (!client) return { state: "not_portal_user" };
    return {
      state: "ok",
      client,
      email: user.email ?? "",
      isPreview: true,
      clientRole: "client_owner",
      allowedPages: new Set(PORTAL_PAGE_KEYS),
    };
  }

  return { state: "not_portal_user" };
}

/**
 * The guard every portal page and portal action starts with.
 *
 * Redirects away for anything that isn't a usable session, so a caller only
 * ever holds a PortalSession — or `null`, which means "signed-in staff who
 * haven't picked a client to preview yet". /portal turns that into a client
 * picker; the sub-pages send it back to /portal.
 *
 * Pass `requiredPage` from any of the gated sub-pages (Tickets, Contracts,
 * Devices, Security, Microsoft 365) — a session whose clientRole hasn't been
 * granted that page gets sent back to /portal instead of being handed data
 * it isn't supposed to see. Overview itself passes nothing: it has no
 * requiredPage, so every portal login can always reach it.
 */
export async function requirePortalSession(
  previewClientId?: string,
  requiredPage?: PortalPageKey
): Promise<PortalSession | null> {
  const context = await getPortalContext(previewClientId);
  if (context.state === "ok") {
    if (requiredPage && !context.allowedPages.has(requiredPage)) redirect("/portal");
    return context;
  }
  if (context.state === "not_portal_user") return null;
  if (context.state === "unauthenticated") redirect("/login");
  if (context.state === "needs_password_change") redirect("/portal/reset-password");
  redirect("/portal/mfa");
}

/**
 * Lighter check for the MFA enrol/verify screens themselves, which by
 * definition cannot require AAL2 without locking a new user out of the only
 * page that would let them enrol. Confirms "a signed-in portal login" and
 * nothing more — it must never be used to reach client data.
 */
export async function getPortalIdentity(): Promise<{
  userId: string;
  email: string;
  clientId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "client" || !profile.client_id) return null;

  return { userId: user.id, email: user.email ?? "", clientId: profile.client_id };
}
