import { generateClientSuggestions } from "@/lib/anthropic";

const LOOKBACK_DAYS = 30;
const MAX_EMAILS_PER_CLIENT = 15;
const DEDUPE_WINDOW_DAYS = 7;

/**
 * Generates and stores AI suggestions for clients with recent email
 * activity. Nothing here writes to clients/quotes/projects/touchpoints —
 * only to the `suggestions` table, which people review and act on
 * themselves. Returns how many clients were considered and how many
 * suggestions were created.
 */
export async function generateSuggestions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  { maxClients = 20 }: { maxClients?: number } = {}
): Promise<{ clientsConsidered: number; created: number }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: activeClientIdsRows } = await admin
    .from("email_links")
    .select("client_id")
    .gte("received_at", since);

  const allClientIds: string[] = (activeClientIdsRows ?? []).map(
    (r: { client_id: string }) => r.client_id
  );
  const clientIds: string[] = [...new Set(allClientIds)].slice(0, maxClients);

  let created = 0;

  for (const clientId of clientIds) {
    const [{ data: client }, { data: emails }, { data: quotes }, { data: projects }, { data: touchpoints }] =
      await Promise.all([
        admin.from("clients").select("id, name").eq("id", clientId).single(),
        admin
          .from("email_links")
          .select("subject, from_name, from_email, received_at, body_preview, type")
          .eq("client_id", clientId)
          .gte("received_at", since)
          .order("received_at", { ascending: false })
          .limit(MAX_EMAILS_PER_CLIENT),
        admin
          .from("quotes")
          .select("title, status, amount, follow_up_due_date")
          .eq("client_id", clientId)
          .in("status", ["draft", "sent", "follow_up_needed"]),
        admin
          .from("projects")
          .select("name, status, target_end_date")
          .eq("client_id", clientId)
          .in("status", ["planning", "active", "on_hold"]),
        admin
          .from("touchpoints")
          .select("type, due_date, completed_at")
          .eq("client_id", clientId)
          .order("due_date", { ascending: false })
          .limit(3),
      ]);

    if (!client || !emails || emails.length === 0) continue;

    const prompt = buildPrompt(client.name, emails, quotes ?? [], projects ?? [], touchpoints ?? []);

    let generated;
    try {
      generated = await generateClientSuggestions(prompt);
    } catch (err) {
      console.error(`Suggestion generation failed for client ${client.name}`, err);
      continue;
    }

    for (const suggestion of generated) {
      const isDuplicate = await hasRecentSimilarSuggestion(admin, clientId, suggestion.kind);
      if (isDuplicate) continue;

      const { error } = await admin.from("suggestions").insert({
        client_id: clientId,
        kind: suggestion.kind,
        summary: suggestion.summary,
        detail: suggestion.detail,
      });
      if (!error) created += 1;
    }
  }

  return { clientsConsidered: clientIds.length, created };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasRecentSimilarSuggestion(admin: any, clientId: string, kind: string) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("suggestions")
    .select("id")
    .eq("client_id", clientId)
    .eq("kind", kind)
    .eq("status", "open")
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

type EmailRow = {
  subject: string;
  from_name: string | null;
  from_email: string;
  received_at: string;
  body_preview: string | null;
  type: string;
};
type QuoteRow = { title: string; status: string; amount: number | null; follow_up_due_date: string | null };
type ProjectRow = { name: string; status: string; target_end_date: string | null };
type TouchpointRow = { type: string; due_date: string; completed_at: string | null };

function buildPrompt(
  clientName: string,
  emails: EmailRow[],
  quotes: QuoteRow[],
  projects: ProjectRow[],
  touchpoints: TouchpointRow[]
) {
  const emailList = emails
    .map(
      (e) =>
        `- [${e.received_at.slice(0, 10)}] From ${e.from_name ?? e.from_email}: "${e.subject}" — ${e.body_preview ?? "(no preview)"}`
    )
    .join("\n");

  const quoteList = quotes.length
    ? quotes.map((q) => `- "${q.title}" (${q.status}, follow-up due ${q.follow_up_due_date ?? "not set"})`).join("\n")
    : "None currently tracked.";

  const projectList = projects.length
    ? projects.map((p) => `- "${p.name}" (${p.status}, target end ${p.target_end_date ?? "not set"})`).join("\n")
    : "None currently tracked.";

  const touchpointList = touchpoints.length
    ? touchpoints
        .map((t) => `- ${t.type} due ${t.due_date}${t.completed_at ? " (completed)" : " (not completed)"}`)
        .join("\n")
    : "None on record.";

  return `You are helping an account manager at an MSP (managed IT services provider) stay on top of a client relationship. You will see recent emails with/about this client, plus what's already being tracked in their CRM. Flag only things that are genuinely new, actionable, or notable — not things already obviously covered by what's tracked. It is completely fine to return zero suggestions.

Client: ${clientName}

Recent emails (last ${LOOKBACK_DAYS} days):
${emailList || "None."}

Currently tracked open quotes:
${quoteList}

Currently tracked active projects:
${projectList}

Recent touchpoints on record:
${touchpointList}

Look for: quote follow-ups that seem to need attention and aren't already logged with a near-term follow-up date, signs of a new project or service opportunity mentioned in email, signs the client hasn't been proactively contacted in a while relative to their email activity, or anything worth preparing for their next quarterly review. Use the report_suggestions tool.`;
}
