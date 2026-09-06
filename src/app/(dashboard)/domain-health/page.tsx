import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { DomainHealthPanel } from "@/components/domain-health-panel";
import { CgWatcherPanel } from "@/components/cg-watcher-panel";
import { Tabs } from "@/components/tabs";
import { checkDomainHealthAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DomainHealthPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_domain_health"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Domain Health</h1>
        <p className="mt-1 text-sm text-slate-500">Domain checks, plus a launch point for other standalone tools.</p>
      </div>

      <Tabs
        tabs={[
          {
            label: "Domain Health",
            content: (
              <div className="space-y-6">
                <p className="text-sm text-slate-500">
                  Check any domain&apos;s DNS, MX, SPF, DMARC, DKIM, and registration/expiration —
                  not limited to existing clients.
                </p>
                <DomainHealthPanel action={checkDomainHealthAction} title="Check a domain" />
              </div>
            ),
          },
          {
            label: "CG Watcher",
            content: <CgWatcherPanel />,
          },
        ]}
      />
    </div>
  );
}
