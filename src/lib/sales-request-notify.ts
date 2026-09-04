import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, buildSalesRequestEmail } from "@/lib/resend";

type Admin = ReturnType<typeof createAdminClient>;

/** Best-effort — a missing Resend key, unset rep email, or send failure
 * never blocks the actual create/update/note action itself. */
export async function notifySalesRequestChange(requestId: string, changeSummary: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: request }, { data: repSettings }] = await Promise.all([
      admin
        .from("sales_requests")
        .select("title, stage, assigned_to, clients(name)")
        .eq("id", requestId)
        .single(),
      admin.from("sales_notification_settings").select("rep_email").eq("id", true).maybeSingle(),
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

    const recipients = [...new Set(
      [repSettings?.rep_email, assigneeEmail].filter((e): e is string => Boolean(e))
    )];
    if (recipients.length === 0) return;

    const resend = getResendClient();
    const fromAddress =
      process.env.REMINDERS_FROM_EMAIL ?? "CG Client Tracker <reminders@example.com>";
    const clientName = (request.clients as unknown as { name: string } | null)?.name ?? null;

    const { html, text } = buildSalesRequestEmail({
      title: request.title,
      stage: request.stage,
      clientName,
      changeSummary,
    });

    await Promise.all(
      recipients.map((to) =>
        resend.emails.send({
          from: fromAddress,
          to,
          subject: `Sales request: ${request.title}`,
          html,
          text,
        })
      )
    );
  } catch (err) {
    console.error("Failed to send sales-request notification email", err);
  }
}
