import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type EmailTemplateKey = "quarterly_review" | "contract_usage_report";

export type EmailTemplateDef = {
  key: EmailTemplateKey;
  label: string;
  description: string;
  placeholders: string[];
  defaultSubject: string;
  defaultIntro: string;
  /** Label for the second editable body field, or omitted entirely when
   * this template has no use for one (Block of Hours Usage Report has no
   * Acknowledge button, so nothing sits next to it to caption). */
  noteLabel?: string;
  noteDescription?: string;
  defaultNote?: string;
};

/** Every client-facing email this app sends with editable copy — shown
 * under Settings → Integrations → Email Templates. Adding a new
 * template later means one entry here (plus using getEmailTemplate at
 * the send site) — the settings page renders every entry generically. */
export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "quarterly_review",
    label: "Quarterly Review",
    description:
      "Sent when a quarterly review is approved and emailed to a client, and again on each unacknowledged reminder.",
    placeholders: ["{client_name}", "{review_period}"],
    defaultSubject: "Quarterly Systems Review — {review_period} — {client_name}",
    defaultIntro: "The full review is attached as a PDF.",
    noteLabel: "Note next to Acknowledge",
    noteDescription:
      "Shown just above the Acknowledge button — how a client should reach out if they have questions, before continuing to \"Otherwise, please Acknowledge below\" (that part is fixed, since it refers to the actual button).",
    defaultNote: "If you need any clarification, create a helpdesk ticket and a tech will get back to you.",
  },
  {
    key: "contract_usage_report",
    label: "Block of Hours Usage Report",
    description:
      "Sent from Lookups/Reports → Autotask → Block of hrs usage, when emailing a client their prepaid hours report.",
    placeholders: ["{client_name}"],
    defaultSubject: "Block of Hours Usage Report — {client_name}",
    defaultIntro:
      "Please find attached your current prepaid block hours usage report, showing hours purchased, used, and remaining, along with the individual time entries recorded against it.",
    noteLabel: "Note after usage summary",
    noteDescription: "Shown just below the hours-used summary, before the sign-off.",
    defaultNote: "If you have any questions about this report, please contact your account manager.",
  },
];

export type EmailTemplate = { subject: string; intro: string; note: string };

/** Live-reads the saved override for this template, falling back to its
 * hardcoded default when nothing's been saved yet (or the saved value is
 * blank) — never throws just because the table's empty. */
export async function getEmailTemplate(admin: Admin, key: EmailTemplateKey): Promise<EmailTemplate> {
  const def = EMAIL_TEMPLATES.find((t) => t.key === key);
  const { data } = await admin
    .from("email_templates")
    .select("subject, intro, note")
    .eq("key", key)
    .maybeSingle();
  return {
    subject: data?.subject || def?.defaultSubject || "",
    intro: data?.intro || def?.defaultIntro || "",
    note: data?.note || def?.defaultNote || "",
  };
}

/** Simple `{name}` substitution — every template here only ever has a
 * handful of known placeholders (client name, review period), not
 * arbitrary user input, so plain string replace is enough. */
export function applyTemplateVars(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), template);
}
