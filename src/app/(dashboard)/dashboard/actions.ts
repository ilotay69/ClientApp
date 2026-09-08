"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { reviewMailbox, MAX_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, type MailboxReviewResult } from "@/lib/mailbox-review";
import { getValidAccessToken } from "@/lib/mail-sync";
import { fetchUpcomingEvents } from "@/lib/microsoft-graph";
import type { SuggestionStatus, MailConnection } from "@/lib/types";

export type MailboxReviewState = { error: string | null; result: MailboxReviewResult | null };

/** Live read of the signed-in user's own connected mailbox — nothing here
 * is persisted except the two preference fields below (excludes,
 * days-back), never email content. `days`/`focus`/`excludes` come from
 * the form (see MailboxReviewPanel) — `days` is clamped again here
 * defensively even though the input already caps at 90, since form data
 * can't be trusted just because the input has a max attribute. The
 * excludes/days are saved back to this user's own mail_connections row on
 * every run, so the form comes back pre-filled next time (the free-text
 * `focus` question is deliberately NOT remembered — it's a one-off query,
 * not a standing preference). */
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

  await admin
    .from("mail_connections")
    .update({
      review_excludes: excludeTerms || null,
      review_lookback_days: lookbackDays,
    })
    .eq("user_id", user.id);

  try {
    const result = await reviewMailbox(admin, connection as MailConnection, {
      lookbackDays,
      focus,
      excludeTerms: excludeTerms || undefined,
    });
    return { error: null, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox review failed.", result: null };
  }
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
 * occurrence, not "this kind of meeting" generally). */
export async function dismissAppointmentType(subject: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("dismissed_appointment_subjects")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return;

  const normalized = normalizeAppointmentSubject(subject);
  const current: string[] = connection.dismissed_appointment_subjects ?? [];
  if (current.includes(normalized)) return;

  await admin
    .from("mail_connections")
    .update({ dismissed_appointment_subjects: [...current, normalized] })
    .eq("user_id", user.id);

  revalidatePath("/tasks");
}

export async function clearDismissedAppointmentTypes(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("mail_connections").update({ dismissed_appointment_subjects: [] }).eq("user_id", user.id);
  revalidatePath("/tasks");
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}
