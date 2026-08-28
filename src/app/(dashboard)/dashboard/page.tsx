import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatDate, isOverdue, isServiceCheckOverdue } from "@/lib/format";
import { RefreshInsightsButton } from "@/components/refresh-insights-button";
import { SuggestionCard } from "@/components/suggestion-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user?.id ?? "")
    .single();
  const canSeeTeamWide = me?.role === "director" || me?.role === "manager";

  const [
    { data: myTasks },
    { data: allOpenTasks },
    { data: dueTouchpoints },
    { data: activeProjects },
    { data: suggestions },
    { data: serviceChecks },
    { data: members },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, kind, title, due_date, clients(name)")
      .eq("assigned_to", user?.id ?? "")
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasks")
      .select("id, assigned_to, profiles:assigned_to(full_name)")
      .in("status", ["open", "in_progress"]),
    supabase
      .from("touchpoints")
      .select("id, type, due_date, owner_id, clients(name)")
      .is("completed_at", null)
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status, target_end_date, clients(name)")
      .in("status", ["planning", "active", "on_hold"])
      .order("target_end_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("suggestions")
      .select("id, client_id, kind, summary, detail, priority, clients(name)")
      .eq("status", "open")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("client_service_checks")
      .select("id, cadence_days, last_checked_at, clients(name), service_catalog(name, default_cadence_days)"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const myOpenTouchpoints = (dueTouchpoints ?? []).filter((t) => t.owner_id === user?.id);
  const overdueTouchpoints = (dueTouchpoints ?? []).filter((t) => isOverdue(t.due_date));
  const overdueServiceChecks = (serviceChecks ?? []).filter((sc) => {
    const catalog = sc.service_catalog as unknown as { default_cadence_days: number } | null;
    const cadence = sc.cadence_days ?? catalog?.default_cadence_days ?? 90;
    return isServiceCheckOverdue(sc.last_checked_at, cadence);
  });

  const workloadByPerson = new Map<string, number>();
  for (const t of allOpenTasks ?? []) {
    const name =
      (t.profiles as unknown as { full_name: string } | null)?.full_name ??
      (t.assigned_to ? "Unknown" : "Unassigned");
    workloadByPerson.set(name, (workloadByPerson.get(name) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          What needs attention today, {today}
          {me?.full_name ? ` — hey ${me.full_name.split(" ")[0]}` : ""}.
        </p>
      </div>

      <Section title="Insights" emptyText="No open insights right now." action={<RefreshInsightsButton />}>
        {(suggestions ?? []).map((s) => (
          <SuggestionCard
            key={s.id}
            id={s.id}
            clientId={s.client_id}
            clientName={(s.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
            kind={s.kind}
            summary={s.summary}
            detail={s.detail}
            priority={s.priority}
            members={members ?? []}
          />
        ))}
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="My open tasks" value={myTasks?.length ?? 0} href="/tasks?mine=1" />
        <StatCard
          label="Touchpoints past due"
          value={overdueTouchpoints.length}
          href="/touchpoints"
        />
        <StatCard
          label="Service checks overdue"
          value={overdueServiceChecks.length}
          href="/clients"
        />
        <StatCard
          label="Active projects"
          value={activeProjects?.length ?? 0}
          href="/projects"
        />
      </div>

      <Section title="My tasks" emptyText="Nothing assigned to you right now." action={
        <Link href="/tasks?mine=1" className="text-sm text-slate-600 hover:underline">
          View all
        </Link>
      }>
        {(myTasks ?? []).slice(0, 8).map((t) => (
          <Row key={t.id} href="/tasks">
            <div>
              <p className="text-sm font-medium text-slate-900">{t.title}</p>
              <p className="text-xs text-slate-500">
                {(t.clients as unknown as { name: string } | null)?.name ?? "No client"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue(t.due_date) && <OverdueBadge />}
              <span className="text-xs text-slate-500">Due {formatDate(t.due_date)}</span>
              <Badge value={t.kind} />
            </div>
          </Row>
        ))}
      </Section>

      {canSeeTeamWide && workloadByPerson.size > 0 && (
        <Section title="Team workload (open tasks)" emptyText="Nothing assigned across the team.">
          <div className="flex flex-wrap gap-3 px-5 py-4">
            {[...workloadByPerson.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <Link
                  key={name}
                  href="/tasks?view=all"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:border-slate-300"
                >
                  <span className="font-medium text-slate-900">{name}</span>{" "}
                  <span className="text-slate-500">
                    {count} open task{count === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
          </div>
        </Section>
      )}

      <Section
        title={canSeeTeamWide ? "Overdue service checks" : "Your overdue service checks"}
        emptyText="Everything's within cadence."
      >
        {overdueServiceChecks.slice(0, 8).map((sc) => {
          const catalog = sc.service_catalog as unknown as { name: string } | null;
          return (
            <Row key={sc.id} href="/clients">
              <div>
                <p className="text-sm font-medium text-slate-900">{catalog?.name ?? "Service"}</p>
                <p className="text-xs text-slate-500">
                  {(sc.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <OverdueBadge />
                <span className="text-xs text-slate-500">
                  Last checked {formatDate(sc.last_checked_at)}
                </span>
              </div>
            </Row>
          );
        })}
      </Section>

      <Section
        title={canSeeTeamWide ? "Touchpoints coming up" : "Your touchpoints coming up"}
        emptyText="No touchpoints scheduled."
      >
        {(canSeeTeamWide ? dueTouchpoints ?? [] : myOpenTouchpoints).slice(0, 8).map((t) => (
          <Row key={t.id} href={`/touchpoints/${t.id}`}>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
              </p>
              <p className="text-xs text-slate-500">
                Due {formatDate(t.due_date)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue(t.due_date) && <OverdueBadge />}
              <Badge value={t.type} />
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </Link>
  );
}

function Section({
  title,
  emptyText,
  children,
  action,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-slate-100">
        {hasChildren ? (
          children
        ) : (
          <p className="px-5 py-4 text-sm text-slate-500">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
