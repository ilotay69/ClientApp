import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServiceCoverageAnalysis } from "@/components/service-coverage-analysis";
import { TimeEntryPatterns } from "@/components/time-entry-patterns";
import { hasPermission } from "@/lib/permissions";
import { analyzeServiceCoverageAction, analyzeTimeEntryPatternsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_services"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI-driven reports across clients and services. More analyses land here over time.
        </p>
      </div>

      <ServiceCoverageAnalysis action={analyzeServiceCoverageAction} />

      <TimeEntryPatterns analyzeAction={analyzeTimeEntryPatternsAction} />
    </div>
  );
}
