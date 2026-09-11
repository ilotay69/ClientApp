import { Resend } from "resend";

let client: Resend | null = null;

export function getResendClient() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export type DigestItem = {
  label: string;
  detail: string;
  href: string;
};

export function buildDigestEmail(recipientName: string, items: DigestItem[]) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <a href="${appUrl}${item.href}" style="color:#0f172a;font-weight:600;text-decoration:none;">${escapeHtml(
        item.label
      )}</a>
            <div style="color:#64748b;font-size:13px;margin-top:2px;">${escapeHtml(
              item.detail
            )}</div>
          </td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#0f172a;">Hi ${escapeHtml(recipientName)}, you have ${
        items.length
      } item${items.length === 1 ? "" : "s"} needing attention</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin-top:24px;color:#64748b;font-size:13px;">
        Sent by CG Ops (daily reminder job).
      </p>
    </div>
  `;

  const text = items
    .map((item) => `- ${item.label}: ${item.detail} (${appUrl}${item.href})`)
    .join("\n");

  return { html, text };
}

export type TaskAssignedInfo = {
  title: string;
  detail: string | null;
  clientName: string | null;
  priority: string;
  dueDate: string | null;
  assignedByName: string | null;
};

export function buildTaskAssignedEmail(recipientName: string, task: TaskAssignedInfo) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const firstName = recipientName.split(" ")[0] || recipientName;

  const meta = [
    task.clientName ? `Client: ${task.clientName}` : "Internal task",
    `Priority: ${task.priority}`,
    task.dueDate ? `Due: ${task.dueDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#0f172a;">Hi ${escapeHtml(firstName)}, you've been assigned a task</h2>
      <p style="margin:16px 0 4px;">
        <a href="${appUrl}/tasks" style="color:#0f172a;font-weight:600;text-decoration:none;font-size:16px;">${escapeHtml(
          task.title
        )}</a>
      </p>
      ${task.detail ? `<p style="color:#334155;font-size:14px;margin:4px 0;">${escapeHtml(task.detail)}</p>` : ""}
      <p style="color:#64748b;font-size:13px;margin-top:8px;">${escapeHtml(meta)}</p>
      ${
        task.assignedByName
          ? `<p style="margin-top:16px;color:#64748b;font-size:13px;">Assigned by ${escapeHtml(
              task.assignedByName
            )}.</p>`
          : ""
      }
      <p style="margin-top:24px;color:#64748b;font-size:13px;">
        Sent by CG Ops.
      </p>
    </div>
  `;

  const text = `You've been assigned: ${task.title}${task.detail ? `\n${task.detail}` : ""}\n${meta}${
    appUrl ? `\n${appUrl}/tasks` : ""
  }`;

  return { html, text };
}

export type SalesRequestNotifyInfo = {
  title: string;
  stage: string;
  clientName: string | null;
  changeSummary: string;
  detail: string | null;
  requestedByName: string | null;
};

export function buildSalesRequestEmail(info: SalesRequestNotifyInfo) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // One scannable summary line — client, item, requester — rather than
  // that information spread across several stacked paragraphs.
  const summaryParts = [
    info.clientName ?? "Internal",
    info.title,
    info.requestedByName ? `Requested by ${info.requestedByName}` : null,
  ].filter((p): p is string => Boolean(p));
  const summaryLine = summaryParts.join("  ·  ");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;font-size:18px;line-height:1.6;">
      <h2 style="color:#0f172a;font-size:26px;margin-bottom:14px;">Sales request update</h2>
      <p style="margin:0 0 6px;">
        <a href="${appUrl}/sales-requests" style="color:#0f172a;font-weight:600;text-decoration:none;font-size:21px;">${escapeHtml(
          summaryLine
        )}</a>
      </p>
      <p style="color:#0f172a;font-size:20px;font-weight:600;margin:18px 0 6px;">${escapeHtml(info.changeSummary)}</p>
      <p style="color:#64748b;font-size:17px;margin:6px 0;">Stage: ${escapeHtml(info.stage)}</p>
      ${
        info.detail
          ? `<p style="color:#334155;font-size:18px;margin:14px 0;white-space:pre-line;">${escapeHtml(info.detail)}</p>`
          : ""
      }
      <p style="margin-top:28px;color:#64748b;font-size:15px;">
        Sent by CG Ops.
      </p>
    </div>
  `;

  const textParts = [
    summaryLine,
    info.changeSummary,
    `Stage: ${info.stage}`,
    info.detail,
    appUrl ? `${appUrl}/sales-requests` : null,
  ].filter((p): p is string => Boolean(p));
  const text = textParts.join("\n");

  return { html, text };
}

/** Replaces Supabase's own "resetPasswordForEmail" magic-link email for the
 * client portal — that flow proved fragile across this app's domain
 * changes (the recovery link's redirectTo has to exactly match Supabase's
 * allow-listed Redirect URLs, which drifted every time the app moved
 * domains) and gave no visibility when it silently failed. This is a plain
 * temp password, same as a brand-new portal login already gets — the
 * recipient is forced to set a real password (must_change_password) before
 * reaching anything else the first time they sign in with it. */
export function buildPortalPasswordResetEmail(recipientName: string, tempPassword: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const firstName = recipientName.split(" ")[0] || recipientName;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#0f172a;">Hi ${escapeHtml(firstName)}, your client portal password was reset</h2>
      <p style="color:#334155;font-size:14px;">
        Use this temporary password to sign in — you&rsquo;ll be asked to set a new one right away.
      </p>
      <p style="margin:16px 0;">
        <code style="display:inline-block;background:#f1f5f9;border-radius:6px;padding:8px 12px;font-size:16px;font-weight:600;color:#0f172a;">${escapeHtml(
          tempPassword
        )}</code>
      </p>
      ${
        appUrl
          ? `<p style="margin:16px 0;"><a href="${appUrl}/login" style="color:#0f172a;font-weight:600;text-decoration:none;">Sign in →</a></p>`
          : ""
      }
      <p style="margin-top:24px;color:#64748b;font-size:13px;">
        If you didn&rsquo;t request this, contact CG Technologies right away.
      </p>
    </div>
  `;

  const text = `Your client portal password was reset.

Temporary password: ${tempPassword}

Sign in${appUrl ? ` at ${appUrl}/login` : ""} — you'll be asked to set a new password right away.

If you didn't request this, contact CG Technologies right away.`;

  return { html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
