import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildSalesRequestEmail } from "@/lib/resend";

/** Best-effort — a missing Resend key, unset rep email, or send failure
 * never blocks the actual create/update/note action itself.
 *
 * Notifies whichever side DIDN'T make the change, not both every time:
 * the assignee changing something notifies the sales rep, and the sales
 * rep changing something notifies the assignee. `actorUserId` is whoever
 * performed the action (null if not resolvable), used only to tell which
 * side that was — if neither matches (e.g. an Owner steps in), the rep
 * gets notified by default, same as any other non-rep actor. */
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
    const actorIsRep = Boolean(
      actorEmail && repEmail && actorEmail.toLowerCase() === repEmail.toLowerCase()
    );

    const recipient = actorIsRep ? assigneeEmail : repEmail;
    if (!recipient) return;
    // Don't notify someone about their own change.
    if (actorEmail && recipient.toLowerCase() === actorEmail.toLowerCase()) return;

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

    await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: `Sales request: ${request.title}`,
      html,
      text,
    });
  } catch (err) {
    console.error("Failed to send sales-request notification email", err);
  }
}
