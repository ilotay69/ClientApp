import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { AlertRow } from "@/components/alert-row";
import { DashboardWidgetCard } from "@/components/dashboard-widget-card";
import {
  IconAlertTriangle,
  IconCheckSquare,
  IconCalendar,
  IconFolder,
  IconUsers,
  IconClipboardCheck,
  IconTag,
} from "@/components/icons";
import { formatDate, isOverdue } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import {
  getEligibleDashboardWidgetKeys,
  getDashboardPreference,
  resolveDashboardWidgets,
} from "@/lib/dashboard-widgets";
import { fetchAllReviews, reviewBucket, getQuarterlyReviewApproverEmail } from "@/lib/quarterly-review-data";
import { acknowledgeAlertAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, canViewDashboard] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", user?.id ?? "").single(),
    hasPermission(supabase, "view_dashboard"),
  ]);

  // Every other gated page falls back to /dashboard on missing
  // permission — this page can't do the same (that would loop), so it
  // shows an inline notice instead of redirecting anywhere.
  if (!canViewDashboard) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">No access</h1>
        <p className="mt-2 text-sm text-slate-500">
          You don&apos;t have permission to view the Dashboard. Ask an Owner to grant it from
          Team → Roles &amp; permissions.
        </p>
      </div>
    );
  }

  const [eligibleKeys, preference, approverEmail] = await Promise.all([
    getEligibleDashboardWidgetKeys(supabase),
    user?.id ? getDashboardPreference(user.id) : Promise.resolve({ enabledWidgets: null }),
    getQuarterlyReviewApproverEmail(),
  ]);
  const widgets = resolveDashboardWidgets(eligibleKeys, preference);
  const enabled = new Set(widgets.map((w) => w.key));
  const isApprover = (user?.email ?? "").toLowerCase() === approverEmail.toLowerCase();

  const [
    { data: myTasks },
    { data: allOpenTasks },
    { data: dueTouchpoints },
    { data: activeProjects },
    { data: myAlerts },
    allReviews,
    { data: openSalesRequests },
    { count: newCandidateCount },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, kind, title, due_date, clients(name)")
      .eq("assigned_to", user?.id ?? "")
      .not("status", "in", "(done,dismissed)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasks")
      .select("id, assigned_to, profiles:assigned_to(full_name)")
      .eq("is_personal", false)
      .not("status", "in", "(done,dismissed)"),
    supabase
      .from("touchpoints")
      .select("id, contact_method, due_date, owner_id, clients(name)")
      .is("completed_at", null)
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status, target_end_date, clients(name)")
      .in("status", ["planning", "active", "on_hold"])
      .order("target_end_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("alerts")
      .select("id, title, detail, href")
      .eq("recipient_id", user?.id ?? "")
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false }),
    enabled.has("quarterly_reviews") ? fetchAllReviews() : Promise.resolve([]),
    supabase
      .from("sales_requests")
      .select("id, title, stage, clients(name)")
      .not("stage", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false }),
    supabase.from("resumes").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const myOpenTouchpoints = (dueTouchpoints ?? []).filter((t) => t.owner_id === user?.id);
  const overdueTouchpoints = (dueTouchpoints ?? []).filter((t) => isOverdue(t.due_date));
  const upcomingTouchpoints = (dueTouchpoints ?? []).filter((t) => !isOverdue(t.due_date));

  const workloadByPerson = new Map<string, number>();
  for (const t of allOpenTasks ?? []) {
    const name =
      (t.profiles as unknown as { full_name: string } | null)?.full_name ??
      (t.assigned_to ? "Unknown" : "Unassigned");
    workloadByPerson.set(name, (workloadByPerson.get(name) ?? 0) + 1);
  }

  const myReviews = (allReviews ?? []).filter(
    (r) =>
      (r.createdById === user?.id && reviewBucket(r.status) !== "sent") ||
      (isApprover && r.status === "submitted")
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          What needs attention today, {today}
          {me?.full_name ? ` — hey ${me.full_name.split(" ")[0]}` : ""}.
        </p>
      </div>

      {(myAlerts ?? []).length > 0 && enabled.has("alerts") && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-2.5">
            <IconAlertTriangle className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-semibold text-red-800">Alerts</h2>
            <span className="ml-auto text-xs font-medium text-red-700">{(myAlerts ?? []).length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {(myAlerts ?? []).slice(0, 5).map((a) => (
              <AlertRow key={a.id} id={a.id} title={a.title} detail={a.detail} href={a.href} action={acknowledgeAlertAction} />
            ))}
          </div>
          {(myAlerts ?? []).length > 5 && (
            <details className="group border-t border-slate-100">
              <summary className="cursor-pointer list-none px-5 py-2 text-xs font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
                Show {(myAlerts ?? []).length - 5} more
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {(myAlerts ?? []).slice(5).map((a) => (
                  <AlertRow key={a.id} id={a.id} title={a.title} detail={a.detail} href={a.href} action={acknowledgeAlertAction} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {enabled.has("my_tasks") && (
          <DashboardWidgetCard
            title="My Open Tasks"
            count={myTasks?.length ?? 0}
            countLabel="assigned to you"
            icon={IconCheckSquare}
            accent="blue"
            href="/tasks?mine=1"
            urgent={(myTasks ?? []).some((t) => isOverdue(t.due_date))}
          >
            {(myTasks ?? []).length === 0 ? (
              <EmptyRow text="Nothing assigned to you right now." />
            ) : (
              (myTasks ?? []).slice(0, 5).map((t) => (
                <WidgetRow key={t.id} href="/tasks">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "No client"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOverdue(t.due_date) && <OverdueBadge />}
                    <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>
                  </div>
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("touchpoints_due") && (
          <DashboardWidgetCard
            title="Touchpoints Past Due"
            count={overdueTouchpoints.length}
            countLabel="overdue"
            icon={IconCalendar}
            accent="amber"
            href="/touchpoints"
            urgent={overdueTouchpoints.length > 0}
          >
            {overdueTouchpoints.length === 0 ? (
              <EmptyRow text="Nothing overdue." />
            ) : (
              overdueTouchpoints.slice(0, 5).map((t) => (
                <WidgetRow key={t.id} href={`/touchpoints/${t.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                    </p>
                    <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                  </div>
                  {t.contact_method && <Badge value={t.contact_method} />}
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("active_projects") && (
          <DashboardWidgetCard
            title="Active Projects"
            count={activeProjects?.length ?? 0}
            countLabel="in progress"
            icon={IconFolder}
            accent="purple"
            href="/projects"
            urgent={(activeProjects ?? []).some((p) => isOverdue(p.target_end_date))}
          >
            {(activeProjects ?? []).length === 0 ? (
              <EmptyRow text="No active projects." />
            ) : (
              (activeProjects ?? []).slice(0, 5).map((p) => (
                <WidgetRow key={p.id} href={`/projects/${p.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(p.clients as unknown as { name: string } | null)?.name ?? "No client"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.target_end_date ? `Target ${formatDate(p.target_end_date)}` : ""}
                  </span>
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("team_workload") && (
          <DashboardWidgetCard
            title="Team Workload"
            count={[...workloadByPerson.values()].reduce((sum, n) => sum + n, 0)}
            countLabel="open tasks across the team"
            icon={IconUsers}
            accent="indigo"
            href="/tasks?view=all"
          >
            {workloadByPerson.size === 0 ? (
              <EmptyRow text="Nothing assigned across the team." />
            ) : (
              <div className="divide-y divide-slate-100">
                {[...workloadByPerson.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([name, count], i) => (
                    <div key={name} className="flex items-center gap-3 px-5 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{name}</span>
                      <span className="shrink-0 text-sm font-semibold text-slate-700">
                        {count} <span className="font-normal text-slate-400">open</span>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("touchpoints_upcoming") && (
          <DashboardWidgetCard
            title="Touchpoints Coming Up"
            count={upcomingTouchpoints.length}
            countLabel="scheduled"
            icon={IconCalendar}
            accent="amber"
            href="/touchpoints"
          >
            {upcomingTouchpoints.length === 0 ? (
              <EmptyRow text="No touchpoints scheduled." />
            ) : (
              upcomingTouchpoints.slice(0, 5).map((t) => (
                <WidgetRow key={t.id} href={`/touchpoints/${t.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                    </p>
                    <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                  </div>
                  {t.contact_method && <Badge value={t.contact_method} />}
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("quarterly_reviews") && (
          <DashboardWidgetCard
            title="Quarterly Reviews"
            count={myReviews.length}
            countLabel="need your attention"
            icon={IconClipboardCheck}
            accent="teal"
            href="/quarterly-reviews"
            urgent={myReviews.length > 0}
          >
            {myReviews.length === 0 ? (
              <EmptyRow text="Nothing needs your attention." />
            ) : (
              myReviews.slice(0, 5).map((r) => (
                <WidgetRow key={r.id} href={`/quarterly-reviews/${r.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.clientName}</p>
                    <p className="truncate text-xs text-slate-500">{r.reviewPeriod}</p>
                  </div>
                  <Badge value={r.status} />
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("sales_requests") && (
          <DashboardWidgetCard
            title="Internal Sales"
            count={openSalesRequests?.length ?? 0}
            countLabel="open requests"
            icon={IconTag}
            accent="emerald"
            href="/sales-requests"
          >
            {(openSalesRequests ?? []).length === 0 ? (
              <EmptyRow text="Nothing open right now." />
            ) : (
              (openSalesRequests ?? []).slice(0, 5).map((r) => (
                <WidgetRow key={r.id} href="/sales-requests">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(r.clients as unknown as { name: string } | null)?.name ?? "Internal"}
                    </p>
                  </div>
                  <Badge value={r.stage} />
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("recruitment") && (
          <DashboardWidgetCard
            title="Recruitment"
            count={newCandidateCount ?? 0}
            countLabel="new candidates"
            icon={IconUsers}
            accent="pink"
            href="/recruitment"
          >
            {(newCandidateCount ?? 0) === 0 ? (
              <EmptyRow text="No new candidates waiting." />
            ) : (
              <p className="px-5 py-3 text-sm text-slate-600">
                {newCandidateCount} candidate{newCandidateCount === 1 ? "" : "s"} waiting to be screened.
              </p>
            )}
          </DashboardWidgetCard>
        )}
      </div>

      {enabled.has("my_tasks") && myOpenTouchpoints.length > 0 && !enabled.has("touchpoints_upcoming") && (
        // Falls back to a plain list only if the touchpoint widgets above are
        // both off but the user still has some due — keeps "my touchpoints"
        // reachable even with a pared-down widget selection.
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Your touchpoints coming up</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {myOpenTouchpoints.slice(0, 8).map((t) => (
              <WidgetRow key={t.id} href={`/touchpoints/${t.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                  </p>
                  <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isOverdue(t.due_date) && <OverdueBadge />}
                  {t.contact_method && <Badge value={t.contact_method} />}
                </div>
              </WidgetRow>
            ))}
          </div>
        </div>
      )}

      {widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Every widget is turned off.{" "}
            <Link href="/settings/dashboard" className="font-medium text-brand underline">
              Choose what to show
            </Link>
            .
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Want a different mix?{" "}
        <Link href="/settings/dashboard" className="underline">
          Choose what shows on your Dashboard
        </Link>
        .
      </p>
    </div>
  );
}

function WidgetRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
      {children}
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-3 text-sm text-slate-500">{text}</p>;
}
