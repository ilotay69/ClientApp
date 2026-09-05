import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildDigestEmail, type DigestItem } from "@/lib/resend";
import { formatDate, isServiceCheckOverdue } from "@/lib/format";

export const dynamic = "force-dynamic";

type OwnerBucket = {
  email: string;
  name: string;
  items: DigestItem[];
  logEntries: { kind: "touchpoint" | "project" | "task" | "service_check"; entity_id: string }[];
};

/**
 * Daily reminder digest. Call this once a day (e.g. from a Railway cron
 * service) with header `X-Cron-Secret: <CRON_SECRET>`. It emails each team
 * member a summary of their assigned tasks, touchpoints, projects, and
 * service checks that are due, overdue, or past their cadence, skipping
 * anything already reminded about today.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;

  const [
    { data: tasks },
    { data: touchpoints },
    { data: projects },
    { data: serviceChecks },
    { data: alreadySent },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_date, assigned_to, clients(name), profiles:assigned_to(email, full_name)")
      .not("status", "in", "(done,dismissed)")
      .lte("due_date", today)
      .not("assigned_to", "is", null),
    supabase
      .from("touchpoints")
      .select("id, type, due_date, owner_id, clients(name), profiles:owner_id(email, full_name)")
      .is("completed_at", null)
      .lte("due_date", today)
      .not("owner_id", "is", null),
    supabase
      .from("projects")
      .select("id, name, target_end_date, owner_id, clients(name), profiles:owner_id(email, full_name)")
      .in("status", ["planning", "active", "on_hold"])
      .lte("target_end_date", today)
      .not("owner_id", "is", null),
    supabase
      .from("client_service_checks")
      .select(
        "id, client_id, cadence_days, last_checked_at, assigned_to, clients(name), service_catalog(name, default_cadence_days), profiles:assigned_to(email, full_name)"
      )
      .not("assigned_to", "is", null),
    supabase.from("reminder_log").select("kind, entity_id").gte("sent_at", todayStart),
  ]);

  const sentToday = new Set(
    (alreadySent ?? []).map((r: { kind: string; entity_id: string }) => `${r.kind}:${r.entity_id}`)
  );

  const buckets = new Map<string, OwnerBucket>();

  function addItem(
    ownerId: string | null,
    profile: { email: string; full_name: string } | null,
    kind: "touchpoint" | "project" | "task" | "service_check",
    entityId: string,
    item: DigestItem
  ) {
    if (!ownerId || !profile?.email) return;
    if (sentToday.has(`${kind}:${entityId}`)) return;

    const bucket = buckets.get(ownerId) ?? {
      email: profile.email,
      name: profile.full_name,
      items: [],
      logEntries: [],
    };
    bucket.items.push(item);
    bucket.logEntries.push({ kind, entity_id: entityId });
    buckets.set(ownerId, bucket);
  }

  for (const task of tasks ?? []) {
    const clientName = (task.clients as unknown as { name: string } | null)?.name ?? "a client";
    addItem(
      task.assigned_to,
      task.profiles as unknown as { email: string; full_name: string } | null,
      "task",
      task.id,
      {
        label: task.title,
        detail: `${clientName}${task.due_date ? ` · due ${formatDate(task.due_date)}` : ""}`,
        href: "/tasks",
      }
    );
  }

  for (const t of touchpoints ?? []) {
    const clientName = (t.clients as unknown as { name: string } | null)?.name ?? "a client";
    const label = t.type === "quarterly_review" ? "Quarterly review" : "Monthly visit";
    addItem(
      t.owner_id,
      t.profiles as unknown as { email: string; full_name: string } | null,
      "touchpoint",
      t.id,
      {
        label: `${label} with ${clientName}`,
        detail: `Due ${formatDate(t.due_date)}`,
        href: `/touchpoints/${t.id}`,
      }
    );
  }

  for (const p of projects ?? []) {
    const clientName = (p.clients as unknown as { name: string } | null)?.name ?? "a client";
    addItem(
      p.owner_id,
      p.profiles as unknown as { email: string; full_name: string } | null,
      "project",
      p.id,
      {
        label: `Project target date: ${p.name}`,
        detail: `${clientName} · target ${formatDate(p.target_end_date)}`,
        href: `/projects/${p.id}`,
      }
    );
  }

  for (const sc of serviceChecks ?? []) {
    const clientName = (sc.clients as unknown as { name: string } | null)?.name ?? "a client";
    const catalog = sc.service_catalog as unknown as {
      name: string;
      default_cadence_days: number;
    } | null;
    const cadence = sc.cadence_days ?? catalog?.default_cadence_days ?? 90;
    if (!isServiceCheckOverdue(sc.last_checked_at, cadence)) continue;
    addItem(
      sc.assigned_to,
      sc.profiles as unknown as { email: string; full_name: string } | null,
      "service_check",
      sc.id,
      {
        label: `${catalog?.name ?? "Service check"} overdue`,
        detail: `${clientName} · last checked ${formatDate(sc.last_checked_at)}`,
        href: `/clients/${sc.client_id}`,
      }
    );
  }

  if (buckets.size === 0) {
    return NextResponse.json({ sent: 0, recipients: [] });
  }

  const resend = getResendClient();
  const fromAddress = process.env.REMINDERS_FROM_EMAIL ?? "CG Client Tracker <reminders@example.com>";
  const results: { email: string; itemCount: number }[] = [];
  const logRows: { kind: string; entity_id: string; recipient_email: string }[] = [];

  for (const [, bucket] of buckets) {
    const { html, text } = buildDigestEmail(bucket.name, bucket.items);
    await resend.emails.send({
      from: fromAddress,
      to: bucket.email,
      subject: `${bucket.items.length} item${bucket.items.length === 1 ? "" : "s"} need your attention`,
      html,
      text,
    });

    results.push({ email: bucket.email, itemCount: bucket.items.length });
    for (const entry of bucket.logEntries) {
      logRows.push({ ...entry, recipient_email: bucket.email });
    }
  }

  if (logRows.length > 0) {
    await supabase.from("reminder_log").insert(logRows);
  }

  return NextResponse.json({ sent: results.length, recipients: results });
}
