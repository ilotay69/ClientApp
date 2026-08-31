import { generateClientSuggestions } from "@/lib/anthropic";

const LOOKBACK_DAYS = 30;
const MAX_EMAILS_PER_CLIENT = 15;
const DEDUPE_WINDOW_DAYS = 7;

/**
 * Generates and stores AI suggestions for clients with recent email
 * activity. Nothing here writes to clients/projects/touchpoints/tasks on
 * its own — only to the `suggestions` table, which people review and act
 * on themselves (or promote into an assigned task). Returns how many
 * clients were considered and how many suggestions were created.
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
    const [{ data: client }, { data: emails }, { data: projects }, { data: touchpoints }] =
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

    const prompt = buildPrompt(client.name, emails, projects ?? [], touchpoints ?? []);

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
        priority: suggestion.priority ?? "normal",
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
type ProjectRow = { name: string; status: string; target_end_date: string | null };
type TouchpointRow = { type: string; due_date: string; completed_at: string | null };

function buildPrompt(
  clientName: string,
  emails: EmailRow[],
  projects: ProjectRow[],
  touchpoints: TouchpointRow[]
) {
  const emailList = emails
    .map(
      (e) =>
        `- [${e.received_at.slice(0, 10)}] From ${e.from_name ?? e.from_email} (tagged "${e.type}"): "${e.subject}" — ${e.body_preview ?? "(no preview)"}`
    )
    .join("\n");

  const projectList = projects.length
    ? projects.map((p) => `- "${p.name}" (${p.status}, target end ${p.target_end_date ?? "not set"})`).join("\n")
    : "None currently tracked.";

  const touchpointList = touchpoints.length
    ? touchpoints
        .map((t) => `- ${t.type} due ${t.due_date}${t.completed_at ? " (completed)" : " (not completed)"}`)
        .join("\n")
    : "None on record.";

  return `You are helping an MSP (managed IT services provider) owner and their team of managers and techs stay on top of a client relationship. You will see recent emails with/about this client, plus what's already being tracked in their ops system. Flag only things that are genuinely new, actionable, or notable — not things already obviously covered by what's tracked. It is completely fine to return zero suggestions. Nobody here creates formal price quotes in this system (that's handled by sales elsewhere), so never include or ask for a dollar amount.

Client: ${clientName}

Recent emails (last ${LOOKBACK_DAYS} days):
${emailList || "None."}

Currently tracked active projects:
${projectList}

Recent touchpoints on record:
${touchpointList}

Look for, in order of importance:
1. urgent_alert — anything time-sensitive: an outage, a security or compliance notice, an angry or urgent-sounding customer, anything that shouldn't wait.
2. quote_follow_up — a customer asked for pricing/a quote and nobody's replied yet, OR pricing was sent and the customer's gone quiet with no reply. No dollar amount needed, just flag that a follow-up is owed.
3. new_project — an email suggests a new project, engagement, or piece of work that isn't already in the tracked project list above.
4. stale_contact — the client's been emailing but hasn't had a proactive check-in in a while relative to that activity.
5. review_prep — something worth bringing up at their next monthly visit or quarterly review.
6. opportunity — a possible upsell or new-service signal that isn't urgent.
7. follow_up / other — anything else that looks unhandled.

Mark priority "high" only for something genuinely time-sensitive or important — most suggestions should be "normal". Use the report_suggestions tool.`;
}
