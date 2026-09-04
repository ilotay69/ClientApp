import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { IconDownload } from "@/components/icons";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/api/reports/clients",
    title: "Client roster",
    description: "Every client with their primary contact and which integrations they're mapped to.",
  },
  {
    href: "/api/reports/devices",
    title: "Device inventory",
    description:
      "Every NinjaOne-synced device across all clients — OS, status, hardware age. As current as each client's last NinjaOne sync.",
  },
  {
    href: "/api/reports/tickets",
    title: "Open tickets",
    description:
      "Every open Autotask ticket across all clients, oldest activity first. As current as each client's last Autotask sync.",
  },
  {
    href: "/api/reports/hours",
    title: "Hours summary",
    description: "Today/yesterday/week/month logged hours per client, live from Autotask.",
  },
];

export default async function ReportsPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Downloadable CSV exports across all clients.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <a
            key={r.href}
            href={r.href}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </div>
            <IconDownload className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          </a>
        ))}
      </div>
    </div>
  );
}
