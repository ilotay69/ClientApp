import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildSalesRequestEmail } from "@/lib/resend";

/** Best-effort — a missing Resend key, unset rep email, or send failure
 * never blocks the actual create/update/note action itself.
 *
 * Notifies both the person who made the change and the sales rep, every
 * time — no exclusions. (Previously excluded whoever acted, so the rep
 * making a change wouldn't notify themselves; but sales requests
 * auto-assign the creator, so on create the actor and assignee were
 * always the same person — if that person was also the rep, every
 * candidate got excluded and nobody was notified at all. Simpler and
 * more predictable to always include both.) `actorUserId` is whoever
 * performed the action (null if not resolvable). */
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
        .select("title, stage, detail, requested_by_name, clients(name)")
        .eq("id", requestId)
        .single(),
      admin.from("sales_notification_settings").select("rep_email").eq("id", true).maybeSingle(),
      actorUserId
        ? admin.from("profiles").select("email").eq("id", actorUserId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!request) return;

    const repEmail = repSettings?.rep_email ?? null;
    const actorEmail = actorProfile?.email ?? null;

    // Both get notified, always — deduped case-insensitively since the
    // actor and the rep can be the same person.
    const seen = new Set<string>();
    const recipients: string[] = [];
    for (const candidate of [repEmail, actorEmail]) {
      if (!candidate) continue;
      const lower = candidate.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      recipients.push(candidate);
    }

    if (recipients.length === 0) {
      console.error("Sales-request notification skipped: no recipient resolved", {
        requestId,
        repEmail,
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
