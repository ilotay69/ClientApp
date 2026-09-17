import { createAdminClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type DashboardWidgetKey =
  | "alerts"
  | "my_tasks"
  | "my_personal_tasks"
  | "my_tickets"
  | "touchpoints_due"
  | "touchpoints_upcoming"
  | "active_projects"
  | "team_workload"
  | "hours_worked"
  | "unassigned_l1_tickets"
  | "forticloud_expiring"
  | "quarterly_reviews"
  | "sales_requests"
  | "recruitment";

export type DashboardWidgetDef = {
  key: DashboardWidgetKey;
  label: string;
  description: string;
};

/** Every widget the Dashboard can show, in display order — shown as
 * checkboxes on Settings -> Dashboard (only the ones a given user is
 * actually eligible for, per getEligibleDashboardWidgetKeys below) and
 * rendered on the Dashboard itself in this same order, filtered to
 * whichever the user has chosen (see resolveDashboardWidgets). */
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { key: "alerts", label: "Alerts", description: "Notifications addressed to you that you haven't acknowledged yet." },
  { key: "my_tasks", label: "My Open Tasks", description: "Tasks assigned to you that aren't done yet." },
  {
    key: "my_personal_tasks",
    label: "My Personal Tasks",
    description: "Your own My To-Do list items — private to you, whether or not they're tied to work in this app.",
  },
  { key: "my_tickets", label: "My Tickets", description: "Open Autotask tickets assigned to you." },
  { key: "touchpoints_due", label: "Touchpoints Past Due", description: "Client touchpoints that are overdue." },
  { key: "touchpoints_upcoming", label: "Touchpoints Coming Up", description: "Client touchpoints scheduled soon." },
  { key: "active_projects", label: "Active Projects", description: "Projects currently planning, active, or on hold." },
  { key: "team_workload", label: "Team Workload", description: "Open task counts across the whole team." },
  { key: "hours_worked", label: "Team Hours", description: "Hours logged yesterday and this month, per technician (Autotask)." },
  {
    key: "unassigned_l1_tickets",
    label: "Unassigned Level 1 Tickets",
    description: "Open tickets in the Level 1 queue with no resource assigned yet, across every client.",
  },
  {
    key: "forticloud_expiring",
    label: "FortiCloud Devices Expiring",
    description: "FortiCloud devices whose support has expired or expires within 30 days.",
  },
  { key: "quarterly_reviews", label: "Quarterly Reviews", description: "Reviews awaiting your approval, or your own drafts." },
  { key: "sales_requests", label: "Internal Sales", description: "Sales requests still open." },
  { key: "recruitment", label: "Recruitment", description: "New candidates waiting to be screened." },
];

const DEFAULT_ELIGIBLE_KEYS: DashboardWidgetKey[] = [
  "alerts",
  "my_tasks",
  "my_personal_tasks",
  "my_tickets",
  "active_projects",
];

/** Which widgets this user could possibly see at all, independent of their
 * own on/off preference — a widget behind a permission they don't hold
 * never shows up as an option on the settings page, or on the dashboard
 * itself even if an old preference row still lists it (e.g. after a role
 * change took a permission away). */
export async function getEligibleDashboardWidgetKeys(supabase: AnyClient): Promise<Set<DashboardWidgetKey>> {
  const me = await getMyPermissions(supabase);
  const eligible = new Set<DashboardWidgetKey>(DEFAULT_ELIGIBLE_KEYS);
  if (!me) return eligible;

  if (me.permissions.has("manage_touchpoints")) {
    eligible.add("touchpoints_due");
    eligible.add("touchpoints_upcoming");
  }
  if (me.permissions.has("view_team_wide")) {
    eligible.add("team_workload");
    eligible.add("unassigned_l1_tickets");
  }
  if (me.permissions.has("view_lookups")) {
    eligible.add("hours_worked");
    eligible.add("forticloud_expiring");
  }
  if (me.permissions.has("manage_quarterly_reviews")) eligible.add("quarterly_reviews");
  if (me.permissions.has("view_sales_requests")) eligible.add("sales_requests");
  if (me.permissions.has("manage_recruitment")) eligible.add("recruitment");
  return eligible;
}

export type DashboardPreference = {
  enabledWidgets: DashboardWidgetKey[] | null;
};

/** Null enabledWidgets means "no preference saved yet" — every eligible
 * widget shows, so a first-ever visit is never a blank dashboard (see
 * 117_dashboard_preferences.sql). Once someone saves a choice on the
 * settings page, only the widgets they kept checked show from then on. */
export async function getDashboardPreference(
  userId: string,
  admin: AnyClient = createAdminClient()
): Promise<DashboardPreference> {
  const { data } = await admin
    .from("dashboard_preferences")
    .select("enabled_widgets")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { enabledWidgets: null };
  return { enabledWidgets: (data.enabled_widgets ?? []) as DashboardWidgetKey[] };
}

/** Which widgets to actually render, and in what order. With no saved
 * preference, that's just the catalog's own order. Once someone has saved
 * one, enabled_widgets IS the order (Settings → Dashboard's reorder
 * arrows work by resubmitting this same array in the new sequence) — so a
 * saved preference renders in ITS order, not the catalog's, dropping any
 * key that's no longer eligible or no longer exists. */
export function resolveDashboardWidgets(
  eligible: Set<DashboardWidgetKey>,
  preference: DashboardPreference
): DashboardWidgetDef[] {
  if (preference.enabledWidgets === null) {
    return DASHBOARD_WIDGETS.filter((w) => eligible.has(w.key));
  }
  const byKey = new Map(DASHBOARD_WIDGETS.map((w) => [w.key, w]));
  return preference.enabledWidgets
    .filter((key) => eligible.has(key))
    .map((key) => byKey.get(key))
    .filter((w): w is DashboardWidgetDef => w !== undefined);
}
