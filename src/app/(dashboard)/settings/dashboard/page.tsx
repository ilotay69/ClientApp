import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DASHBOARD_WIDGETS,
  getEligibleDashboardWidgetKeys,
  getDashboardPreference,
} from "@/lib/dashboard-widgets";
import { DashboardPreferencesForm } from "@/components/dashboard-preferences-form";
import { saveDashboardWidgetPreferencesAction } from "./actions";

export const dynamic = "force-dynamic";

// Personal, ungated by any permission beyond being signed in — same
// posture as /settings/mail: it's each user's own view of their own
// Dashboard, not a shared setting anyone needs manage_integrations (or
// similar) to touch.
export default async function DashboardSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [eligibleKeys, preference] = await Promise.all([
    getEligibleDashboardWidgetKeys(supabase),
    getDashboardPreference(user.id),
  ]);

  const availableWidgets = DASHBOARD_WIDGETS.filter((w) => eligibleKeys.has(w.key));
  const enabledKeys = preference.enabledWidgets ?? availableWidgets.map((w) => w.key);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which sections show on your own Dashboard — everyone on the team can pick a
          different mix. Only widgets you already have access to are listed here.
        </p>
      </div>

      <DashboardPreferencesForm
        widgets={availableWidgets}
        enabledKeys={enabledKeys}
        saveAction={saveDashboardWidgetPreferencesAction}
      />
    </div>
  );
}
