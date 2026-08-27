import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildDigestEmail, type DigestItem } from "@/lib/resend";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type OwnerBucket = {
  email: string;
  name: string;
  items: DigestItem[];
  logEntries: { kind: "quote" | "touchpoint" | "project"; entity_id: string }[];
};

/**
 * Daily reminder digest. Call this once a day (e.g. from a Railway cron
 * service) with header `X-Cron-Secret: <CRON_SECRET>`. It emails each team
 * member a summary of their quotes, projects, and touchpoints that are due
 * or overdue, skipping anything already reminded about today.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;

  const [{ data: quotes }, { data: touchpoints }, { data: projects }, { data: alreadySent }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, title, follow_up_due_date, owner_id, clients(name), profiles:owner_id(email, full_name)")
        .in("status", ["sent", "follow_up_needed"])
        .lte("follow_up_due_date", today)
        .not("owner_id", "is", null),
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
      supabase.from("reminder_log").select("kind, entity_id").gte("sent_at", todayStart),
    ]);

  const sentToday = new Set(
    (alreadySent ?? []).map((r: { kind: string; entity_id: string }) => `${r.kind}:${r.entity_id}`)
  );

  const buckets = new Map<string, OwnerBucket>();

  function addItem(
    ownerId: string | null,
    profile: { email: string; full_name: string } | null,
    kind: "quote" | "touchpoint" | "project",
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

  for (const q of quotes ?? []) {
    const clientName = (q.clients as unknown as { name: string } | null)?.name ?? "a client";
    addItem(
      q.owner_id,
      q.profiles as unknown as { email: string; full_name: string } | null,
      "quote",
      q.id,
      {
        label: `Quote follow-up: ${q.title}`,
        detail: `${clientName} · due ${formatDate(q.follow_up_due_date)}`,
        href: `/quotes/${q.id}`,
      }
    );
  }

  for (const t of touchpoints ?? []) {
    const clientName = (t.clients as unknown as { name: string } | null)?.name ?? "a client";
    const label = t.type === "quarterly_review" ? "Quarterly review" : "Personal check-in";
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
