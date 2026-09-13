// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/** Not a DB enum on purpose — see 108_alerts.sql. Extend this union (and
 * give the new kind a spot in the reminder digest, if it should appear
 * there) rather than adding a migration to allow another kind. */
export type AlertKind =
  | "task_assigned"
  | "quarterly_review_submitted"
  | "quarterly_review_approved"
  | "quarterly_review_adjustment_requested";

/** Creates one in-app alert per recipient — shown on the Overview page
 * until acknowledged (acknowledgeAlertAction, dashboard/actions.ts), and
 * folded into the next daily reminder digest for as long as it stays
 * unacknowledged (/api/reminders). This replaces an immediate email for
 * internal, staff-to-staff notifications — the daily digest is meant to
 * stay the one email that actually matters. Best-effort: never throws, so
 * a failed insert can't block whatever real action (assigning a task,
 * submitting a review) triggered it. */
export async function createAlert(
  admin: AdminClient,
  recipientIds: (string | null | undefined)[],
  kind: AlertKind,
  title: string,
  detail: string | null,
  href: string | null
): Promise<void> {
  const uniqueIds = [...new Set(recipientIds.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return;

  const { error } = await admin
    .from("alerts")
    .insert(uniqueIds.map((recipient_id) => ({ recipient_id, kind, title, detail, href })));
  if (error) console.error("createAlert failed", { kind, error });
}
