import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type PermissionKey =
  | "manage_team"
  | "manage_roles"
  | "manage_services"
  | "view_team_wide"
  | "manage_clients"
  | "manage_projects"
  | "manage_touchpoints"
  | "delete_tasks"
  | "manage_integrations"
  | "manage_sales_requests"
  | "view_domain_health"
  | "view_lookups"
  | "view_analysis"
  | "view_dashboard"
  | "view_clients"
  | "view_projects"
  | "view_team_tasks"
  | "view_sales_requests"
  | "manage_client_access"
  | "manage_recruitment"
  | "manage_reconciliation";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manage_team: "Add team members & change roles",
  manage_roles: "Edit this permission matrix",
  manage_services: "Create, edit & manage recurring services (catalog & client services)",
  view_team_wide: "View team-wide dashboard data",
  manage_clients: "Create, edit & delete clients",
  manage_projects: "Create, edit & delete projects",
  manage_touchpoints: "Create, edit & delete touchpoints",
  delete_tasks: "Delete tasks",
  manage_integrations: "Configure AI providers & integrations",
  manage_sales_requests: "Create, edit & delete sales requests",
  view_domain_health: "View the Domain Health tool",
  view_lookups: "View the Lookups page (Autotask/NinjaOne/M365/security vendor data)",
  view_analysis: "View the Analysis page (trend charts & Security by Type)",
  view_dashboard: "View the Overview dashboard",
  view_clients: "View the client list & client detail pages",
  view_projects: "View the project list & project detail pages",
  view_team_tasks: "View the team-wide Tasks list (My To-Do is always visible)",
  view_sales_requests: "View the Internal Sales / Sales Requests pipeline",
  manage_client_access: "Create & revoke client portal logins",
  manage_recruitment: "Screen resumes & manage job postings (candidate PII)",
  manage_reconciliation: "View & manage the licence reconciliation report (service↔licence mappings)",
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

/** The roles that belong to CG staff. Deliberately an allowlist and not
 * "everything except 'client'": a role added later is locked out of the whole
 * staff app until it's named here on purpose. Mirrors public.is_staff() in
 * the database — keep the two in step. */
export const STAFF_ROLES = ["owner", "manager", "tech", "sales_rep"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: UserRole | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Computes the signed-in user's role and granted permission set. 'owner'
 * short-circuits to every key, hardcoded — never reads role_permissions for
 * that role, so an Owner can never revoke their own access. */
export async function getMyPermissions(
  supabase: SupabaseClient
): Promise<{ userId: string; role: UserRole; permissions: Set<PermissionKey> } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me) return null;

  if (me.role === "owner") {
    return { userId: user.id, role: "owner", permissions: new Set(ALL_PERMISSION_KEYS) };
  }

  // A client-portal login holds no staff permission, ever. That was already
  // true in practice, but only because nothing seeds role_permissions rows for
  // 'client' — an accident, not a boundary. Make it explicit, so the seed
  // idiom used in 060 (`select role, ... from role_permissions where
  // permission = '<existing>'`, which copies rows for whatever roles exist)
  // can never quietly hand a permission to a customer.
  if (!isStaffRole(me.role as UserRole)) {
    return {
      userId: user.id,
      role: me.role as UserRole,
      permissions: new Set<PermissionKey>(),
    };
  }

  const { data: rows } = await supabase
    .from("role_permissions")
    .select("permission, enabled")
    .eq("role", me.role);

  const permissions = new Set<PermissionKey>(
    (rows ?? [])
      .filter((r: { permission: string; enabled: boolean }) => r.enabled)
      .map((r: { permission: string; enabled: boolean }) => r.permission as PermissionKey)
  );
  return { userId: user.id, role: me.role as UserRole, permissions };
}

/** Boolean check for pages/Server Components that already hold a `supabase`
 * client, e.g. `if (!(await hasPermission(supabase, "view_team_wide")))`. */
export async function hasPermission(
  supabase: SupabaseClient,
  permission: PermissionKey
): Promise<boolean> {
  const me = await getMyPermissions(supabase);
  return me?.permissions.has(permission) ?? false;
}

/** Server-action guard — drop-in replacement for the old private
 * `requireDirector()`: builds its own client, returns the auth user if
 * permitted, else null. Call sites keep the same
 * `if (!(await requirePermission("x"))) return;` shape. */
export async function requirePermission(permission: PermissionKey) {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !me.permissions.has(permission)) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Server-action guard for "any CG staff member, regardless of permission".
 *
 * Server Actions are POST endpoints: they run before, and independently of,
 * any layout or page render, so a layout redirect does NOT gate them. Anything
 * that reaches a service-role client — which bypasses RLS entirely — needs its
 * own check at the top of the action, and the ones that read whatever
 * `clientId` the caller passed need it most.
 *
 * Use this for actions with no natural permission key (a sync trigger, a
 * lookup helper). Anything with a real permission should still use
 * requirePermission, which is strictly stronger. */
export async function requireStaff() {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** True if no non-Owner role currently has this permission granted — i.e.
 * it's owner-only right now purely by configuration. Drives the sidebar's
 * "owner only" lock icon for permission-gated links: granting the
 * permission to any other role later makes that lock disappear on its
 * own, no code change needed. */
export async function isPermissionOwnerOnly(
  supabase: SupabaseClient,
  permission: PermissionKey
): Promise<boolean> {
  const { data: rows } = await supabase
    .from("role_permissions")
    .select("enabled")
    .eq("permission", permission)
    .eq("enabled", true);
  return (rows ?? []).length === 0;
}
