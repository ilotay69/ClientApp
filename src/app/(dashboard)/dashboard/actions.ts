"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { reviewMailbox, MAX_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, type MailboxReviewResult } from "@/lib/mailbox-review";
import { purgeSnapshotMessagesFromSenders, syncMailboxSnapshot } from "@/lib/mailbox-snapshot";
import { getValidAccessToken } from "@/lib/mail-sync";
import { fetchUpcomingEvents } from "@/lib/microsoft-graph";
import { requireStaff } from "@/lib/permissions";
import type { SuggestionStatus, MailConnection } from "@/lib/types";

export type MailboxReviewState = { error: string | null; result: MailboxReviewResult | null };

/** Reads the signed-in user's own mailbox snapshot (see mailbox-review.ts)
 * — nothing here writes email content beyond what the background sync
 * already stores. `days`/`focus`/`excludes`/`neverStore` come from the
 * form (see MailboxReviewPanel) — `days` is clamped again here
 * defensively even though the input already caps at 90, since form data
 * can't be trusted just because the input has a max attribute.
 * excludes/days/neverStore are saved back to this user's own
 * mail_connections row on every run, so the form comes back pre-filled
 * next time (the free-text `focus` question is deliberately NOT
 * remembered — it's a one-off query, not a standing preference).
 * Updating `neverStore` also immediately purges any already-stored
 * snapshot rows matching the new list — it wouldn't mean much as a
 * "don't store this" setting if it only applied going forward. */
export async function reviewMyMailbox(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: MailboxReviewState,
  formData: FormData
): Promise<MailboxReviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", result: null };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return {
      error: "Connect your mailbox first on the Mailbox settings page.",
      result: null,
    };
  }

  const rawDays = Number(formData.get("days"));
  const lookbackDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.trunc(rawDays), MAX_LOOKBACK_DAYS) : DEFAULT_LOOKBACK_DAYS;
  const focus = String(formData.get("focus") ?? "").trim() || undefined;
  const excludeTerms = String(formData.get("excludes") ?? "").trim();
  const neverStore = String(formData.get("neverStore") ?? "").trim();

  await admin
    .from("mail_connections")
    .update({
      review_excludes: excludeTerms || null,
      review_lookback_days: lookbackDays,
      sync_excluded_senders: neverStore || null,
    })
    .eq("user_id", user.id);

  await purgeSnapshotMessagesFromSenders(admin, user.id, neverStore);

  try {
    const result = await reviewMailbox(
      admin,
      { ...connection, sync_excluded_senders: neverStore || null } as MailConnection,
      { lookbackDays, focus, excludeTerms: excludeTerms || undefined }
    );
    return { error: null, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox review failed.", result: null };
  }
}

export type SnapshotSender = { email: string; name: string | null; count: number };

/** Every distinct sender currently in the signed-in user's own mailbox
 * snapshot, with how many stored messages came from them — sorted most
 * frequent first, since a frequent sender (a newsletter, a helpdesk, a
 * notification account) is the most likely candidate to actually want
 * excluded. Supabase's JS client has no GROUP BY, so this fetches the raw
 * (email, name) pairs and aggregates in memory — fine at this scale (at
 * most 90 days of one mailbox). */
export async function fetchMySnapshotSenders(): Promise<{ senders: SnapshotSender[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("mailbox_snapshot_messages")
    .select("from_email, from_name")
    .eq("user_id", user.id)
    .not("from_email", "is", null);
  if (error) return { error: error.message };

  const byEmail = new Map<string, SnapshotSender>();
  for (const r of (rows ?? []) as { from_email: string; from_name: string | null }[]) {
    const key = r.from_email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.name && r.from_name) existing.name = r.from_name;
    } else {
      byEmail.set(key, { email: r.from_email, name: r.from_name, count: 1 });
    }
  }

  return { senders: [...byEmail.values()].sort((a, b) => b.count - a.count) };
}

export type UpcomingAppointment = {
  id: string;
  subject: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  location: string | null;
  organizerName: string | null;
  webLink: string | null;
};

const APPOINTMENTS_WINDOW_DAYS = 14;

/** "Type" of appointment = its subject, normalized — dismissing one
 * occurrence of a recurring meeting (or anything sharing that exact
 * subject) hides all of them, not just that one instance. */
function normalizeAppointmentSubject(subject: string): string {
  return subject.trim().toLowerCase();
}

/** Live read of the signed-in user's own calendar, next 2 weeks —
 * requires Calendars.Read, added to MAIL_SCOPES after some mailboxes were
 * already connected under the old scope list, so a connection made before
 * that change will fail here until reconnected (Settings → Mailbox →
 * Connect again). Nothing here is persisted except the dismissed-subjects
 * list (see dismissAppointmentType/clearDismissedAppointmentTypes) — never
 * event content. */
export async function fetchMyUpcomingAppointments(): Promise<
  { appointments: UpcomingAppointment[]; dismissedCount: number } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return { error: "Connect your mailbox first on the Mailbox settings page." };
  }

  const dismissed = new Set(connection.dismissed_appointment_subjects ?? []);

  try {
    const accessToken = await getValidAccessToken(admin, connection as MailConnection);
    const now = new Date();
    const until = new Date(now.getTime() + APPOINTMENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const events = await fetchUpcomingEvents(accessToken, now.toISOString(), until.toISOString());

    return {
      appointments: events
        .filter((e) => !dismissed.has(normalizeAppointmentSubject(e.subject || "")))
        .map((e) => ({
          id: e.id,
          subject: e.subject || "(no subject)",
          startIso: e.start.dateTime,
          endIso: e.end.dateTime,
          isAllDay: Boolean(e.isAllDay),
          location: e.location?.displayName || null,
          organizerName: e.organizer?.emailAddress?.name ?? e.organizer?.emailAddress?.address ?? null,
          webLink: e.webLink ?? null,
        })),
      dismissedCount: dismissed.size,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load appointments.";
    return {
      error: /\b(403|Forbidden|Authorization_RequestDenied)\b/i.test(message)
        ? "Calendar access wasn't granted when you connected your mailbox — reconnect it on the Mailbox settings page to grant calendar access."
        : message,
    };
  }
}

/** Hides every appointment whose subject normalizes to match `subject`,
 * going forward — a simple per-user allowlist-by-exclusion, not tied to
 * any specific calendar event id (an id would only ever match one
 * occurrence, not "this kind of meeting" generally). Returns an error
 * string on failure instead of silently no-op'ing — a missing
 * dismissed_appointment_subjects column (migration not yet run) used to
 * fail here invisibly, which looked exactly like "dismiss doesn't
 * persist" from the UI side. */
export async function dismissAppointmentType(subject: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { data: connection, error: readError } = await admin
    .from("mail_connections")
    .select("dismissed_appointment_subjects")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("dismissAppointmentType: failed to read mail_connections", readError);
    return { error: `Couldn't save — ${readError.message}` };
  }
  if (!connection) return { error: "Connect your mailbox first on the Mailbox settings page." };

  const normalized = normalizeAppointmentSubject(subject);
  const current: string[] = connection.dismissed_appointment_subjects ?? [];
  if (current.includes(normalized)) return {};

  const { error: writeError } = await admin
    .from("mail_connections")
    .update({ dismissed_appointment_subjects: [...current, normalized] })
    .eq("user_id", user.id);
  if (writeError) {
    console.error("dismissAppointmentType: failed to write mail_connections", writeError);
    return { error: `Couldn't save — ${writeError.message}` };
  }

  revalidatePath("/tasks");
  return {};
}

export async function clearDismissedAppointmentTypes(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("mail_connections")
    .update({ dismissed_appointment_subjects: [] })
    .eq("user_id", user.id);
  if (error) {
    console.error("clearDismissedAppointmentTypes: failed to write mail_connections", error);
    return { error: `Couldn't clear — ${error.message}` };
  }

  revalidatePath("/tasks");
  return {};
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  // Service-role write with a caller-supplied id — RLS can't gate this one.
  if (!(await requireStaff())) return;

  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}

export type SnapshotPreviewRow = {
  id: string;
  receivedAt: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
};

export type SnapshotPreview = {
  rows: SnapshotPreviewRow[];
  totalCount: number;
  oldestReceivedAt: string | null;
};

const SNAPSHOT_PREVIEW_LIMIT = 200;

/** Raw contents of the signed-in user's own mailbox snapshot — date,
 * sender, subject only, most recent first — so it's possible to see
 * directly how much history has actually synced instead of inferring it
 * from analysis results. `totalCount` and `oldestReceivedAt` answer "how
 * far back are we" even when there's more than fits in one preview page. */
export async function fetchMySnapshotPreview(): Promise<SnapshotPreview | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const [{ data: rows, error, count }, { data: oldestRow }] = await Promise.all([
    admin
      .from("mailbox_snapshot_messages")
      .select("id, received_at, from_name, from_email, subject", { count: "exact" })
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(SNAPSHOT_PREVIEW_LIMIT),
    admin
      .from("mailbox_snapshot_messages")
      .select("received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) return { error: error.message };

  return {
    rows: (rows ?? []).map((r) => ({
      id: r.id,
      receivedAt: r.received_at,
      fromName: r.from_name,
      fromEmail: r.from_email,
      subject: r.subject,
    })),
    totalCount: count ?? 0,
    oldestReceivedAt: oldestRow?.received_at ?? null,
  };
}

/** Manually triggers a snapshot sync for the signed-in user's own mailbox
 * right now, instead of waiting for the next ~30-minute cron run — the
 * exact same function the cron itself calls, not a separate lighter-weight
 * path, so a slow first-ever sync (see INITIAL_BACKFILL_DAYS) is still
 * slow here too; this just lets someone trigger it on demand rather than
 * waiting. */
export async function syncMyMailboxNow(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) {
    return { ok: false, message: "Connect your mailbox first on the Mailbox settings page." };
  }

  try {
    const result = await syncMailboxSnapshot(admin, connection as MailConnection);
    return {
      ok: true,
      message: `Synced — ${result.upserted} new/updated, ${result.skipped} skipped (excluded), ${result.pruned} pruned.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sync failed." };
  }
}

/** Hides one mailbox-review recommendation going forward — keyed to the
 * exact (conversation, message) pair it was about, so a later genuinely
 * new reply on that same thread isn't silently suppressed too (see
 * reviewMailbox's dismissedKeys filtering). Upserts rather than inserts:
 * dismissing an already-dismissed conversation again (now pointing at a
 * newer message) just moves the dismissal forward. */
export async function dismissMailboxThread(
  conversationId: string,
  graphMessageId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("dismissed_mailbox_threads").upsert(
    {
      user_id: user.id,
      conversation_id: conversationId,
      dismissed_message_id: graphMessageId,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" }
  );
  if (error) {
    console.error("dismissMailboxThread: failed to write dismissed_mailbox_threads", error);
    return { error: `Couldn't save — ${error.message}` };
  }

  revalidatePath("/tasks");
  return {};
}

export async function clearDismissedMailboxThreads(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("dismissed_mailbox_threads").delete().eq("user_id", user.id);
  if (error) {
    console.error("clearDismissedMailboxThreads: failed to delete dismissed_mailbox_threads", error);
    return { error: `Couldn't clear — ${error.message}` };
  }

  revalidatePath("/tasks");
  return {};
}
