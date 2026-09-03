import { generateClientSuggestions } from "@/lib/ai";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { daysAgo, isOverdue } from "@/lib/format";
import { buildDeviceInsights } from "@/lib/device-insights";

const MAX_TICKET_DESCRIPTION_CHARS = 600;

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
  { maxClients = 20, onlyClientId }: { maxClients?: number; onlyClientId?: string } = {}
): Promise<{ clientsConsidered: number; created: number }> {
  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) return { clientsConsidered: 0, created: 0 };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let clientIds: string[];
  if (onlyClientId) {
    // A single client, explicitly requested from its own page — always
    // attempt it, regardless of the recent-activity gate the batch pool
    // otherwise uses to keep runs cheap.
    clientIds = [onlyClientId];
  } else {
    const [
      { data: activeClientIdsRows },
      { data: ticketedClientIdsRows },
      { data: overdueTaskClientIdsRows },
      { data: offlineDeviceClientIdsRows },
    ] = await Promise.all([
      admin.from("email_links").select("client_id").gte("received_at", since),
      // No lookback window needed here — "has an open ticket" is already
      // the filter (autotask_tickets only ever holds open tickets).
      admin.from("autotask_tickets").select("client_id"),
      // Only overdue tasks bring a client into the pool — every open task
      // would be far too broad a bar for "worth an AI look."
      admin
        .from("tasks")
        .select("client_id")
        .not("client_id", "is", null)
        .not("status", "in", "(done,dismissed)")
        .lt("due_date", new Date().toISOString().slice(0, 10)),
      // Same reasoning — only an offline device is notable enough to
      // warrant a look; online devices are the expected default.
      admin.from("ninjaone_devices").select("client_id").eq("is_offline", true),
    ]);

    const allClientIds: string[] = [
      ...(activeClientIdsRows ?? []).map((r: { client_id: string }) => r.client_id),
      ...(ticketedClientIdsRows ?? []).map((r: { client_id: string }) => r.client_id),
      ...(overdueTaskClientIdsRows ?? []).map((r: { client_id: string }) => r.client_id),
      ...(offlineDeviceClientIdsRows ?? []).map((r: { client_id: string }) => r.client_id),
    ];
    clientIds = [...new Set(allClientIds)].slice(0, maxClients);
  }

  let created = 0;

  for (const clientId of clientIds) {
    const [
      { data: client },
      { data: emails },
      { data: projects },
      { data: touchpoints },
      { data: tickets },
      { data: tasks },
      { data: devices },
      { data: documents },
    ] = await Promise.all([
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
      admin
        .from("autotask_tickets")
        .select("title, description, status, priority, due_date, opened_at, last_activity_at")
        .eq("client_id", clientId),
      admin
        .from("tasks")
        .select("title, status, priority, due_date")
        .eq("client_id", clientId)
        .not("status", "in", "(done,dismissed)"),
      admin
        .from("ninjaone_devices")
        .select("system_name, node_class, is_offline, last_contact, os_name, os_version")
        .eq("client_id", clientId),
      admin
        .from("client_interactions")
        .select("type, subject, created_at")
        .eq("client_id", clientId)
        .in("type", ["quote", "review"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // A client qualifies via emails, open tickets, an overdue task, or an
    // offline device — don't require all of them. A single explicitly-
    // requested client (onlyClientId) always proceeds, even with none of
    // these, so a manual per-client refresh isn't silently skipped just
    // because there's nothing to react to yet.
    const overdueTasks = (tasks ?? []).filter((t: { due_date: string | null }) => isOverdue(t.due_date));
    const offlineDevices = (devices ?? []).filter((d: { is_offline: boolean | null }) => d.is_offline);
    if (!client) continue;
    if (
      !onlyClientId &&
      (!emails || emails.length === 0) &&
      (!tickets || tickets.length === 0) &&
      overdueTasks.length === 0 &&
      offlineDevices.length === 0
    )
      continue;

    const prompt = buildPrompt(
      client.name,
      emails ?? [],
      projects ?? [],
      touchpoints ?? [],
      tickets ?? [],
      tasks ?? [],
      devices ?? [],
      documents ?? []
    );

    let generated;
    try {
      generated = await generateClientSuggestions(prompt, aiSettings);
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
type TicketRow = {
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  opened_at: string | null;
  last_activity_at: string | null;
};
type TaskRow = {
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
};
type DeviceRow = {
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  os_name: string | null;
  os_version: string | null;
};
type DocumentRow = {
  type: "quote" | "review";
  subject: string | null;
  created_at: string;
};

function buildPrompt(
  clientName: string,
  emails: EmailRow[],
  projects: ProjectRow[],
  touchpoints: TouchpointRow[],
  tickets: TicketRow[],
  tasks: TaskRow[],
  devices: DeviceRow[],
  documents: DocumentRow[]
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

  const ticketList = tickets.length
    ? tickets
        .map((t) => {
          const staleDays = daysAgo(t.last_activity_at);
          const openDays = daysAgo(t.opened_at);
          const description = t.description
            ? t.description.slice(0, MAX_TICKET_DESCRIPTION_CHARS)
            : "(no description on the ticket)";
          return `- "${t.title}" (status: ${t.status ?? "unknown"}, priority: ${t.priority ?? "unknown"}${openDays !== null ? `, opened ${openDays}d ago` : ""}${staleDays !== null ? `, last activity ${staleDays}d ago` : ""}${t.due_date ? `, due ${t.due_date.slice(0, 10)}` : ""})\n  What it says: ${description}`;
        })
        .join("\n")
    : "None open.";

  const taskList = tasks.length
    ? tasks
        .map(
          (t) =>
            `- "${t.title}" (status: ${t.status}, priority: ${t.priority}${t.due_date ? `, due ${t.due_date.slice(0, 10)}${isOverdue(t.due_date) ? " — OVERDUE" : ""}` : ", no due date"})`
        )
        .join("\n")
    : "None open.";

  const deviceList = devices.length
    ? devices
        .map((d) => {
          const staleDays = daysAgo(d.last_contact);
          const os = [d.os_name, d.os_version].filter(Boolean).join(" ");
          return `- "${d.system_name}" (${d.node_class ? d.node_class.toLowerCase() : "unknown type"}${os ? `, ${os}` : ""}, ${d.is_offline ? "OFFLINE" : "online"}${staleDays !== null ? ` — last contact ${staleDays}d ago` : ""})`;
        })
        .join("\n")
    : "None synced.";

  // No text extraction — the file itself isn't readable here, just its
  // presence and label. Still enough to flag "a quote is on file with
  // nothing else tracking that work yet."
  const documentList = documents.length
    ? documents
        .map((d) => {
          const label = d.type === "quote" ? "Signed quote" : "Quarterly review";
          return `- [${label}] "${d.subject ?? "Untitled"}" (uploaded ${d.created_at.slice(0, 10)})`;
        })
        .join("\n")
    : "None on file.";

  const deviceIssues = buildDeviceInsights(
    devices.map((d) => ({
      system_name: d.system_name,
      is_offline: d.is_offline,
      last_contact: d.last_contact,
      os_name: d.os_name ?? null,
    }))
  );
  const deviceIssueList = deviceIssues.length
    ? deviceIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title} — ${i.detail}`).join("\n")
    : "None detected.";

  return `You are helping an MSP (managed IT services provider) owner and their team of managers and techs stay on top of a client relationship. You will see recent emails with/about this client, plus what's already being tracked in their ops system, including any open Autotask support tickets. Flag only things that are genuinely new, actionable, or notable — not things already obviously covered by what's tracked. It is completely fine to return zero suggestions. Nobody here creates formal price quotes in this system (that's handled by sales elsewhere), so never include or ask for a dollar amount.

Ignore automated, bulk, or boilerplate mail entirely — it is not a client
signal even if forwarded into this inbox. This includes: vendor
policy/terms/licensing-agreement notices (e.g. "Microsoft account will be
subject to a new agreement..."), renewal or billing reminders sent to every
customer, marketing/newsletter mail, automated system notifications, and
out-of-office replies. None of these should ever produce a suggestion on
their own, regardless of subject urgency-sounding language or a mentioned
deadline — they aren't specific to this client's relationship or situation.

Client: ${clientName}

Recent emails (last ${LOOKBACK_DAYS} days):
${emailList || "None."}

Currently tracked active projects:
${projectList}

Recent touchpoints on record:
${touchpointList}

Open Autotask tickets:
${ticketList}

Open internal tasks tracked for this client:
${taskList}

Uploaded documents (signed quotes and quarterly reviews on file):
${documentList}

Managed devices (NinjaOne):
${deviceList}

Device issues already detected automatically (verified vendor end-of-life
dates and offline durations — treat these as established fact, not guesses;
do not contradict them or re-derive them yourself):
${deviceIssueList}

Look for, in order of importance:
1. urgent_alert — anything time-sensitive: an outage, a security or compliance notice, an angry or urgent-sounding customer, a high-priority ticket that's been open a long time with no apparent resolution, a task marked OVERDUE above (especially high priority), a device that's OFFLINE with a last-contact gap of several days or more (could mean a dead machine, a network outage, or an unpatched security risk going unmonitored), anything that shouldn't wait. Also urgent_alert (not opportunity) for a SERVER running an OS that has reached end-of-life/end-of-support — the "Device issues already detected automatically" list above is authoritative for which operating systems are end-of-life — prefer it over your own recollection of lifecycle dates. An EOL server is a live security exposure (no security patches), which is materially more urgent than an EOL workstation.
2. quote_follow_up — a customer asked for pricing/a quote and nobody's replied yet, OR pricing was sent and the customer's gone quiet with no reply. No dollar amount needed, just flag that a follow-up is owed. This applies to ticket descriptions too, not just emails: read what each ticket actually says the client is asking for — if the description reads like an open question or a request for information/status and "last activity" is stale relative to how long it's been open, that's a strong signal nobody has gotten back to them. Don't flag a ticket just for being open a while if its description doesn't read like it's waiting on a reply (e.g. it's a scheduled/ongoing project ticket). Also check the "Uploaded documents" section above: a Signed quote on file with no matching project or ticket started for it is a strong signal the work hasn't been kicked off yet — flag that.
3. new_project — an email suggests a new project, engagement, or piece of work that isn't already in the tracked project list above.
4. stale_contact — the client's been emailing but hasn't had a proactive check-in in a while relative to that activity.
5. review_prep — something worth bringing up at their next monthly visit or quarterly review, including any notable open ticket. Note: the "Uploaded documents" list only gives you a label and upload date, not the document's actual content — don't invent or guess at what a Quarterly review says, just note when the last one on file was and whether a fresh one looks due.
6. opportunity — a possible upsell or new-service signal that isn't urgent, including a WORKSTATION running an end-of-life/soon-to-expire OS (again, judge this against real vendor support lifecycles you know, not just an old-sounding version number) worth a hardware or OS refresh conversation. A workstation is lower-severity than a server running the same EOL OS (see urgent_alert above) — same underlying fact, different priority.
7. follow_up / other — anything else that looks unhandled, including an open ticket that seems to have gone quiet.

Mark priority "high" only for something genuinely time-sensitive or important — most suggestions should be "normal". Use the report_suggestions tool.`;
}
