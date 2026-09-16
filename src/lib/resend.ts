import { Resend } from "resend";
import type { ContractUsageRow } from "@/lib/contract-hours";

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

export type BackupReportEmailItem = {
  label: string;
  okLabel: string;
  status: "pending" | "ok" | "issue" | "na";
  notes: string | null;
};

export function buildBackupReportEmail(
  reportDate: string,
  items: BackupReportEmailItem[],
  aiAnalysis: string | null
) {
  const statusText = (s: BackupReportEmailItem["status"], okLabel: string) =>
    s === "ok" ? okLabel : s === "issue" ? "ISSUE" : s === "na" ? "N/A" : "Not checked";
  const statusColor = (s: BackupReportEmailItem["status"]) =>
    s === "issue" ? "#dc2626" : s === "ok" ? "#0f172a" : "#94a3b8";

  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${escapeHtml(item.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${statusColor(item.status)};font-weight:600;">${escapeHtml(statusText(item.status, item.okLabel))}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#334155;white-space:pre-line;">${item.notes ? escapeHtml(item.notes) : ""}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#0f172a;">Daily Backup Report — ${escapeHtml(reportDate)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:6px 10px;border-bottom:2px solid #cbd5e1;">Section</th>
            <th style="padding:6px 10px;border-bottom:2px solid #cbd5e1;">Result</th>
            <th style="padding:6px 10px;border-bottom:2px solid #cbd5e1;">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${
        aiAnalysis
          ? `<div style="margin-top:24px;padding:14px 16px;background:#eef2ff;border-radius:8px;">
              <p style="margin:0 0 6px;font-weight:700;color:#3730a3;">AI analysis — last 2 weeks</p>
              <p style="margin:0;white-space:pre-line;color:#334155;">${escapeHtml(aiAnalysis)}</p>
            </div>`
          : ""
      }
      <p style="margin-top:24px;color:#64748b;font-size:13px;">
        Sent by CG Ops.
      </p>
    </div>
  `;

  const textRows = items
    .map((item) => `${item.label}: ${statusText(item.status, item.okLabel)}${item.notes ? ` — ${item.notes}` : ""}`)
    .join("\n");
  const text = `Daily Backup Report — ${reportDate}\n\n${textRows}${
    aiAnalysis ? `\n\nAI analysis — last 2 weeks:\n${aiAnalysis}` : ""
  }`;

  return { html, text };
}

/** Detail (the checklist, comments, screenshots) lives in the attached PDF
 * now, not in the email body — this is just the cover note announcing it,
 * plus the short editable Summary as a preview, plus a link the client can
 * use to acknowledge the review without logging into anything — see
 * src/app/quarterly-review-ack. There's deliberately only one button here
 * (Acknowledge) — discussing the review happens by replying to this email
 * directly, not through a second in-app flow, so a reply always lands
 * somewhere a person reads it rather than as a stored note nobody's
 * watching.
 *
 * reminderLabel (e.g. "First Reminder", "Second Reminder") marks this as a
 * recurring resend of an unacknowledged review — see the reminder cron at
 * src/app/api/quarterly-review-reminders — rather than the original send. */
export function buildQuarterlyReviewClientEmail(
  clientName: string,
  reviewPeriod: string,
  summary: string | null,
  ackUrl: string,
  intro: string,
  reminderLabel?: string | null
) {
  const summaryHtml = summary
    ? `<p style="color:#334155;font-size:15px;white-space:pre-line;background:#f8fafc;border-radius:8px;padding:12px 14px;">${escapeHtml(summary)}</p>`
    : "";
  const reminderBannerHtml = reminderLabel
    ? `<div style="margin-bottom:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">${escapeHtml(reminderLabel)} — this review is still waiting on your acknowledgment.</p>
      </div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      ${reminderBannerHtml}
      <h2 style="color:#0f172a;">Quarterly Systems Review — ${escapeHtml(reviewPeriod)}</h2>
      <p style="color:#64748b;">Prepared for ${escapeHtml(clientName)}</p>
      ${summaryHtml}
      <p style="color:#334155;">${escapeHtml(intro)}</p>
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;">
        <p style="color:#334155;font-size:14px;margin:0 0 12px;">
          If you need any clarification, create a helpdesk ticket and a tech will get back to
          you. Otherwise, please <strong>Acknowledge</strong> below to confirm you've received it
          and accept the risk of any outstanding items not being addressed.
        </p>
        <a href="${ackUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:6px;">Acknowledge</a>
      </div>
      <p style="margin-top:24px;color:#334155;font-size:14px;">
        Best regards,<br />
        CG Technologies Team
      </p>
    </div>
  `;
  const summaryText = summary ? `\n${summary}\n` : "";
  const reminderText = reminderLabel ? `${reminderLabel} — this review is still waiting on your acknowledgment.\n\n` : "";
  const text = `${reminderText}Quarterly Systems Review — ${reviewPeriod}\nPrepared for ${clientName}\n${summaryText}\n${intro}\n\nIf you need any clarification, create a helpdesk ticket and a tech will get back to you.\n\nOtherwise, please acknowledge here (accept the risk of any outstanding items): ${ackUrl}\n\nBest regards,\nCG Technologies Team`;

  return { html, text };
}


/** Cover note for the Contract Usage PDF — same "detail lives in the
 * attachment, this is just the announcement" shape as
 * buildQuarterlyReviewClientEmail, minus that one's acknowledgment link
 * (there's no ack workflow for this report). Includes the headline
 * purchased/used/remaining numbers inline only when there's exactly one
 * active block (the common case) — with more than one, or none, the body
 * stays generic and the PDF carries the actual detail. */
export function buildContractUsageClientEmail(clientName: string, rows: ContractUsageRow[], intro: string) {
  const single = rows.length === 1 ? rows[0] : null;
  const summaryHtml = single
    ? `<div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border-radius:8px;">
        <p style="margin:0;color:#334155;font-size:14px;">
          <strong>${single.used.toFixed(1)}</strong> of <strong>${single.purchased.toFixed(1)}</strong> prepaid hours used
          (${single.percentUsed.toFixed(0)}%) — <strong>${single.remaining.toFixed(1)}</strong> hours remaining.
        </p>
      </div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0f172a;">Block of Hours Usage Report</h2>
      <p style="color:#64748b;">Prepared for ${escapeHtml(clientName)}</p>
      <p style="color:#334155;">${escapeHtml(intro)}</p>
      ${summaryHtml}
      <p style="color:#334155;font-size:14px;">
        If you have any questions about this report, please contact your account manager.
      </p>
      <p style="margin-top:24px;color:#334155;font-size:14px;">
        Best regards,<br />
        CG Technologies Team
      </p>
    </div>
  `;
  const summaryText = single
    ? `\n${single.used.toFixed(1)} of ${single.purchased.toFixed(1)} prepaid hours used (${single.percentUsed.toFixed(0)}%) — ${single.remaining.toFixed(1)} hours remaining.\n`
    : "";
  const text = `Block of Hours Usage Report\nPrepared for ${clientName}\n\n${intro}\n${summaryText}\nIf you have any questions about this report, please contact your account manager.\n\nBest regards,\nCG Technologies Team`;

  return { html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
