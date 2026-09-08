"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { reviewMailbox, MAX_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, type MailboxReviewResult } from "@/lib/mailbox-review";
import { purgeSnapshotMessagesFromSenders } from "@/lib/mailbox-snapshot";
import { getValidAccessToken } from "@/lib/mail-sync";
import { fetchUpcomingEvents } from "@/lib/microsoft-graph";
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
  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}
