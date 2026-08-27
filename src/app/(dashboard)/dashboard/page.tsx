import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatDate, isOverdue } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: openQuotes },
    { data: dueTouchpoints },
    { data: activeProjects },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, title, follow_up_due_date, status, clients(name)")
      .in("status", ["sent", "follow_up_needed"])
      .order("follow_up_due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("touchpoints")
      .select("id, type, due_date, clients(name)")
      .is("completed_at", null)
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status, target_end_date, clients(name)")
      .in("status", ["planning", "active", "on_hold"])
      .order("target_end_date", { ascending: true, nullsFirst: false }),
  ]);

  const overdueQuotes = (openQuotes ?? []).filter((q) =>
    isOverdue(q.follow_up_due_date)
  );
  const overdueTouchpoints = (dueTouchpoints ?? []).filter((t) =>
    isOverdue(t.due_date)
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          What needs attention today, {today}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Quotes needing follow-up"
          value={overdueQuotes.length}
          href="/quotes"
        />
        <StatCard
          label="Touchpoints past due"
          value={overdueTouchpoints.length}
          href="/touchpoints"
        />
        <StatCard
          label="Active projects"
          value={activeProjects?.length ?? 0}
          href="/projects"
        />
      </div>

      <Section title="Quotes to follow up on" emptyText="Nothing outstanding.">
        {(openQuotes ?? []).slice(0, 8).map((q) => (
          <Row key={q.id} href={`/quotes/${q.id}`}>
            <div>
              <p className="text-sm font-medium text-slate-900">{q.title}</p>
              <p className="text-xs text-slate-500">
                {(q.clients as unknown as { name: string } | null)?.name ??
                  "Unknown client"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue(q.follow_up_due_date) && <OverdueBadge />}
              <span className="text-xs text-slate-500">
                Due {formatDate(q.follow_up_due_date)}
              </span>
              <Badge value={q.status} />
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Touchpoints coming up"
        emptyText="No touchpoints scheduled."
      >
        {(dueTouchpoints ?? []).slice(0, 8).map((t) => (
          <Row key={t.id} href={`/touchpoints/${t.id}`}>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {(t.clients as unknown as { name: string } | null)?.name ??
                  "Unknown client"}
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
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
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
