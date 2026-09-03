import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ResourceHoursReport } from "@/components/resource-hours-report";
import { YesterdayTimeEntries } from "@/components/yesterday-time-entries";
import { fetchResourceHoursAction, fetchYesterdayTimeEntriesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_team"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hours</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time logged in Autotask, by resource — today, yesterday, this week, and this month.
        </p>
      </div>

      <ResourceHoursReport action={fetchResourceHoursAction} />

      <YesterdayTimeEntries action={fetchYesterdayTimeEntriesAction} />
    </div>
  );
}
