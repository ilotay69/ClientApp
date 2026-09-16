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
  },
];

export type EmailTemplate = { subject: string; intro: string };

/** Live-reads the saved override for this template, falling back to its
 * hardcoded default when nothing's been saved yet (or the saved value is
 * blank) — never throws just because the table's empty. */
export async function getEmailTemplate(admin: Admin, key: EmailTemplateKey): Promise<EmailTemplate> {
  const def = EMAIL_TEMPLATES.find((t) => t.key === key);
  const { data } = await admin.from("email_templates").select("subject, intro").eq("key", key).maybeSingle();
  return {
    subject: data?.subject || def?.defaultSubject || "",
    intro: data?.intro || def?.defaultIntro || "",
  };
}

/** Simple `{name}` substitution — every template here only ever has a
 * handful of known placeholders (client name, review period), not
 * arbitrary user input, so plain string replace is enough. */
export function applyTemplateVars(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(value), template);
}
