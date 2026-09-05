import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildSalesRequestEmail } from "@/lib/resend";

/** Best-effort — a missing Resend key, unset rep email, or send failure
 * never blocks the actual create/update/note action itself.
 *
 * Notifies both the sales rep and the assignee (the tech who created the
 * request) on every change, minus whoever actually made that change —
 * so e.g. a rep editing the stage still notifies the tech, a tech editing
 * it still notifies the rep, and a third party (an Owner stepping in)
 * notifies both, instead of only the rep. `actorUserId` is whoever
 * performed the action (null if not resolvable), used only to exclude
 * them from their own notification. */
export async function notifySalesRequestChange(
  requestId: string,
  changeSummary: string,
  actorUserId: string | null
): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: request }, { data: repSettings }, { data: actorProfile }] = await Promise.all([
      admin
        .from("sales_requests")
        .select("title, stage, detail, requested_by_name, assigned_to, clients(name)")
        .eq("id", requestId)
        .single(),
      admin.from("sales_notification_settings").select("rep_email").eq("id", true).maybeSingle(),
      actorUserId
        ? admin.from("profiles").select("email").eq("id", actorUserId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!request) return;

    let assigneeEmail: string | null = null;
    if (request.assigned_to) {
      const { data: assignee } = await admin
        .from("profiles")
        .select("email")
        .eq("id", request.assigned_to)
        .maybeSingle();
      assigneeEmail = assignee?.email ?? null;
    }

    const repEmail = repSettings?.rep_email ?? null;
    const actorEmail = actorProfile?.email ?? null;
    const actorEmailLower = actorEmail?.toLowerCase() ?? null;

    // Both sides get notified, minus whoever just made the change
    // themselves — deduped case-insensitively, since the rep and the
    // assignee can be the same person.
    const seen = new Set<string>();
    const recipients: string[] = [];
    for (const candidate of [repEmail, assigneeEmail]) {
      if (!candidate) continue;
      const lower = candidate.toLowerCase();
      if (lower === actorEmailLower || seen.has(lower)) continue;
      seen.add(lower);
      recipients.push(candidate);
    }

    if (recipients.length === 0) {
      console.error("Sales-request notification skipped: no recipient resolved", {
        requestId,
        repEmail,
        assigneeEmail,
        actorEmail,
      });
      return;
    }

    const resend = getResendClient();
    const fromAddress =
      process.env.REMINDERS_FROM_EMAIL ?? "CG Client Tracker <reminders@example.com>";
    const clientName = (request.clients as unknown as { name: string } | null)?.name ?? null;

    const { html, text } = buildSalesRequestEmail({
      title: request.title,
      stage: request.stage,
      clientName,
      changeSummary,
      detail: request.detail,
      requestedByName: request.requested_by_name,
    });

    // Separate sends, not one email addressed to both — recipients
    // shouldn't see each other's address.
    for (const recipient of recipients) {
      await resend.emails.send({
        from: fromAddress,
        to: recipient,
        subject: `Sales request: ${request.title}`,
        html,
        text,
      });
    }
  } catch (err) {
    console.error("Failed to send sales-request notification email", err);
  }
}
