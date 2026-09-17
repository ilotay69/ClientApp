import { Resend } from "resend";
import type { ContractUsageRow } from "@/lib/contract-hours";
import { DEFAULT_PAYMENT_TERMS } from "@/lib/proposal-totals";

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
  note: string,
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
        <p style="color:#334155;font-size:14px;margin:0 0 12px;">${escapeHtml(note)}</p>
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
  const text = `${reminderText}Quarterly Systems Review — ${reviewPeriod}\nPrepared for ${clientName}\n${summaryText}\n${intro}\n\n${note}\n\nAcknowledge here: ${ackUrl}\n\nBest regards,\nCG Technologies Team`;

  return { html, text };
}


/** Cover note for the Contract Usage PDF — same "detail lives in the
 * attachment, this is just the announcement" shape as
 * buildQuarterlyReviewClientEmail, minus that one's acknowledgment link
 * (there's no ack workflow for this report). Includes the headline
 * purchased/used/remaining numbers inline only when there's exactly one
 * active block (the common case) — with more than one, or none, the body
 * stays generic and the PDF carries the actual detail. */
export function buildContractUsageClientEmail(clientName: string, rows: ContractUsageRow[], intro: string, note: string) {
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
        ${escapeHtml(note)}
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
  const text = `Block of Hours Usage Report\nPrepared for ${clientName}\n\n${intro}\n${summaryText}\n${note}\n\nBest regards,\nCG Technologies Team`;

  return { html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The proposal email.
 *
 * Deliberately short, and deliberately carries no PDF. The entire point is
 * to get the prospect onto the tracked link — that's where opens are
 * counted, where optional add-ons can be ticked, and where they can accept
 * in one tap. An attachment gives them a way to read the whole thing
 * without ever touching the link, which throws away the signal the feature
 * exists to produce. The PDF goes out with the acceptance confirmation
 * instead, when it's a record rather than a sales document.
 *
 * Totals are stated as one-off and monthly separately rather than summed:
 * "$4,800 + $650/month" is the number an MSP client actually needs, and
 * collapsing them into one figure would misstate both. */
export function buildProposalEmail(
  recipientName: string | null,
  companyName: string,
  proposalTitle: string,
  headlineTotal: string,
  viewUrl: string,
  validUntil: string | null,
  intro: string,
  note: string,
  reminderLabel?: string | null
) {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hello,";
  const validUntilHtml = validUntil
    ? `<p style="color:#94a3b8;font-size:13px;margin:12px 0 0;">This proposal is valid until ${escapeHtml(validUntil)}.</p>`
    : "";
  const reminderBannerHtml = reminderLabel
    ? `<div style="margin-bottom:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">${escapeHtml(reminderLabel)} — this proposal is still open.</p>
      </div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      ${reminderBannerHtml}
      <h2 style="color:#0f172a;">${escapeHtml(proposalTitle)}</h2>
      <p style="color:#64748b;">Prepared for ${escapeHtml(companyName)}</p>
      <p style="color:#334155;">${greeting}</p>
      <p style="color:#334155;">${escapeHtml(intro)}</p>
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;">
        <p style="margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:600;">${escapeHtml(headlineTotal)}</p>
        <p style="margin:0 0 14px;color:#94a3b8;font-size:12px;">Plus HST.</p>
        <p style="color:#334155;font-size:14px;margin:0 0 12px;">${escapeHtml(note)}</p>
        <a href="${viewUrl}" style="display:inline-block;background:#e93e3f;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:6px;">Review &amp; accept</a>
        ${validUntilHtml}
      </div>
      <p style="margin-top:24px;color:#334155;font-size:14px;">
        Best regards,<br />
        CG Technologies Team
      </p>
    </div>
  `;

  const reminderText = reminderLabel ? `${reminderLabel} — this proposal is still open.\n\n` : "";
  const validUntilText = validUntil ? `\nThis proposal is valid until ${validUntil}.` : "";
  const text = `${reminderText}${proposalTitle}\nPrepared for ${companyName}\n\n${recipientName ? `Hi ${recipientName},` : "Hello,"}\n\n${intro}\n\n${headlineTotal} (plus HST)\n\n${note}\n\nReview and accept here: ${viewUrl}${validUntilText}\n\nBest regards,\nCG Technologies Team`;

  return { html, text };
}

/** The itemized "here's what you signed up for" confirmation, sent to the
 * client immediately after they accept a proposal — the on-page
 * confirmation and the "Already accepted" re-visit page both say a version
 * of "thank you, sales will be in touch", but neither is a document the
 * client can forward to their bookkeeper or file away. This is that
 * document.
 *
 * Deliberately built from the same final item list acceptProposalByTokenAction
 * already recomputed from the database after writing the accepted optional
 * selections — never from anything the browser sent — so this email can
 * never quote a different set of items or a different total than what was
 * actually recorded as agreed to.
 */
export type ProposalAcceptedEmailItem = {
  description: string;
  detail: string | null;
  quantity: number;
  unitPrice: number;
  billingPeriod: "one_off" | "annual" | "monthly";
};

export type ProposalAcceptedEmailTotals = {
  oneOffSubtotal: number;
  annualSubtotal: number;
  monthlySubtotal: number;
  taxRate: number;
  taxAmount: number;
  firstInvoiceTotal: number;
};

const PROPOSAL_ACCEPTED_PERIOD_SECTIONS: {
  value: ProposalAcceptedEmailItem["billingPeriod"];
  label: string;
  suffix: string;
}[] = [
  { value: "one_off", label: "One-time", suffix: "" },
  { value: "annual", label: "Annually", suffix: "/yr" },
  { value: "monthly", label: "Monthly", suffix: "/mo" },
];

function formatMoneyForEmail(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildProposalAcceptedClientEmail(
  recipientName: string | null,
  companyName: string,
  proposalTitle: string,
  items: ProposalAcceptedEmailItem[],
  totals: ProposalAcceptedEmailTotals,
  currency: string,
  intro: string,
  note: string,
  paymentTerms: string | null
) {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hello,";

  const sectionsHtml = PROPOSAL_ACCEPTED_PERIOD_SECTIONS.map((section) => {
    const sectionItems = items.filter((i) => i.billingPeriod === section.value);
    if (sectionItems.length === 0) return "";
    const rows = sectionItems
      .map((item) => {
        const lineTotal = item.quantity * item.unitPrice;
        const qtyLabel = item.quantity !== 1 ? ` &times;${item.quantity}` : "";
        const detailHtml = item.detail
          ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(item.detail)}</div>`
          : "";
        return `<tr>
          <td style="padding:6px 0;color:#334155;font-size:14px;vertical-align:top;">
            ${escapeHtml(item.description)}${qtyLabel}
            ${detailHtml}
          </td>
          <td style="padding:6px 0;color:#0f172a;font-size:14px;text-align:right;white-space:nowrap;vertical-align:top;">
            ${escapeHtml(formatMoneyForEmail(lineTotal, currency))}${section.suffix}
          </td>
        </tr>`;
      })
      .join("");
    return `
      <p style="margin:16px 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${section.label}</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    `;
  }).join("");

  const totalsRows = [
    totals.oneOffSubtotal > 0
      ? `<tr><td style="padding:2px 0;color:#64748b;font-size:13px;">One-time</td><td style="padding:2px 0;text-align:right;color:#334155;font-size:13px;">${escapeHtml(formatMoneyForEmail(totals.oneOffSubtotal, currency))}</td></tr>`
      : "",
    totals.annualSubtotal > 0
      ? `<tr><td style="padding:2px 0;color:#64748b;font-size:13px;">Annually</td><td style="padding:2px 0;text-align:right;color:#334155;font-size:13px;">${escapeHtml(formatMoneyForEmail(totals.annualSubtotal, currency))}/yr</td></tr>`
      : "",
    totals.monthlySubtotal > 0
      ? `<tr><td style="padding:2px 0;color:#64748b;font-size:13px;">Monthly</td><td style="padding:2px 0;text-align:right;color:#334155;font-size:13px;">${escapeHtml(formatMoneyForEmail(totals.monthlySubtotal, currency))}/mo</td></tr>`
      : "",
    `<tr><td style="padding:2px 0;color:#64748b;font-size:13px;">HST (${(totals.taxRate * 100).toFixed(0)}%)</td><td style="padding:2px 0;text-align:right;color:#334155;font-size:13px;">${escapeHtml(formatMoneyForEmail(totals.taxAmount, currency))}</td></tr>`,
  ].join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#0f172a;">${escapeHtml(proposalTitle)} — confirmed</h2>
      <p style="color:#64748b;">${escapeHtml(companyName)}</p>
      <p style="color:#334155;">${greeting}</p>
      <p style="color:#334155;">${escapeHtml(intro)}</p>
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;">
        ${sectionsHtml}
        <table style="width:100%;border-collapse:collapse;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px;">
          ${totalsRows}
        </table>
        <p style="margin:12px 0 0;color:#0f172a;font-size:18px;font-weight:600;">
          ${escapeHtml(formatMoneyForEmail(totals.firstInvoiceTotal, currency))} due at signing
        </p>
        <p style="margin:2px 0 0;color:#94a3b8;font-size:12px;">
          ${escapeHtml(paymentTerms || DEFAULT_PAYMENT_TERMS)}
        </p>
      </div>
      <p style="color:#334155;font-size:14px;">${escapeHtml(note)}</p>
      <p style="margin-top:24px;color:#334155;font-size:14px;">
        Best regards,<br />
        CG Technologies Team
      </p>
    </div>
  `;

  const textLines: string[] = [`${proposalTitle} — confirmed`, companyName, "", recipientName ? `Hi ${recipientName},` : "Hello,", "", intro, ""];
  for (const section of PROPOSAL_ACCEPTED_PERIOD_SECTIONS) {
    const sectionItems = items.filter((i) => i.billingPeriod === section.value);
    if (sectionItems.length === 0) continue;
    textLines.push(`${section.label}:`);
    for (const item of sectionItems) {
      const lineTotal = item.quantity * item.unitPrice;
      const qtyLabel = item.quantity !== 1 ? ` x${item.quantity}` : "";
      textLines.push(`  - ${item.description}${qtyLabel}: ${formatMoneyForEmail(lineTotal, currency)}${section.suffix}`);
      if (item.detail) textLines.push(`    ${item.detail}`);
    }
    textLines.push("");
  }
  if (totals.oneOffSubtotal > 0) textLines.push(`One-time: ${formatMoneyForEmail(totals.oneOffSubtotal, currency)}`);
  if (totals.annualSubtotal > 0) textLines.push(`Annually: ${formatMoneyForEmail(totals.annualSubtotal, currency)}/yr`);
  if (totals.monthlySubtotal > 0) textLines.push(`Monthly: ${formatMoneyForEmail(totals.monthlySubtotal, currency)}/mo`);
  textLines.push(`HST (${(totals.taxRate * 100).toFixed(0)}%): ${formatMoneyForEmail(totals.taxAmount, currency)}`);
  textLines.push(`Total due at signing (incl. HST): ${formatMoneyForEmail(totals.firstInvoiceTotal, currency)}`);
  textLines.push(paymentTerms || DEFAULT_PAYMENT_TERMS);
  textLines.push("");
  textLines.push(note);
  textLines.push("");
  textLines.push("Best regards,\nCG Technologies Team");

  return { html, text: textLines.join("\n") };
}
