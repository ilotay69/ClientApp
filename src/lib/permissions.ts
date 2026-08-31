import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type PermissionKey =
  | "manage_team"
  | "manage_roles"
  | "manage_service_catalog"
  | "view_team_wide"
  | "manage_clients"
  | "manage_projects"
  | "manage_touchpoints"
  | "delete_tasks";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manage_team: "Add team members & change roles",
  manage_roles: "Edit this permission matrix",
  manage_service_catalog: "Manage recurring services",
  view_team_wide: "View team-wide dashboard data",
  manage_clients: "Create, edit & delete clients",
  manage_projects: "Create, edit & delete projects",
  manage_touchpoints: "Create, edit & delete touchpoints",
  delete_tasks: "Delete tasks",
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

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
