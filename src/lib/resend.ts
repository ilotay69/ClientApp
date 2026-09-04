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
        Sent by the CG Client Tracker daily reminder job.
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
        Sent by the CG Client Tracker.
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
        Sent by the CG Client Tracker.
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
