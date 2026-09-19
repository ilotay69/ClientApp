"use server";

import {
  createClient,
  createAdminClient,
  getCurrentUser,
} from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getEligibleDashboardWidgetKeys } from "@/lib/dashboard-widgets";
import { normalizeWorkspace } from "@/lib/dashboard-workspace";

export async function saveDashboardWorkspace(
  input: unknown,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user || !(await hasPermission(supabase, "view_dashboard")))
    return { error: "Sign in with dashboard access to save your workspace." };
  if (JSON.stringify(input ?? {}).length > 65536)
    return { error: "This layout is too large to save." };
  const eligible = [
    ...(await getEligibleDashboardWidgetKeys(supabase)),
    "task_schedule",
  ];
  const config = normalizeWorkspace(input, eligible);
  const { error } = await supabase
    .from("dashboard_workspaces")
    .upsert({ user_id: user.id, config }, { onConflict: "user_id" });
  if (error) {
    console.error("Dashboard workspace save failed", error.code);
    return {
      error:
        "We couldn’t save your layout. Your changes are still here; please try again.",
    };
  }
  return {};
}

export async function acknowledgeDashboardAlert(
  id: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user || !(await hasPermission(supabase, "view_dashboard")))
    return { error: "Dashboard access is required." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid alert." };
  const { data, error } = await createAdminClient()
    .from("alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .select("id")
    .maybeSingle();
  return error || !data
    ? { error: "Couldn’t acknowledge this alert. Please retry." }
    : {};
}
