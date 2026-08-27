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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
