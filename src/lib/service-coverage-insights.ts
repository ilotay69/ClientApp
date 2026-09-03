// On-demand AI read of the service catalog and which clients have which
// services attached, looking for coverage gaps by CATEGORY rather than
// exact product name — a client with "SentinelOne MDR" attached is
// covered for MDR, and shouldn't get flagged just because the catalog
// entry someone's checking against is "Huntress MDR". Matching this
// reliably needs real judgment about what counts as the same kind of
// protection, which is exactly what a rigid keyword/taxonomy table can't
// do well and an LLM can — that's the whole reason this is an AI call
// instead of a plain SQL "clients missing service X" query.
//
// Self-contained Anthropic/OpenAI calls, same reasoning as
// ticket-insights.ts/time-entry-insights.ts: a different output shape
// than the suggestions schema, not worth generalizing that for.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type CatalogServiceForCoverage = {
  name: string;
  description: string | null;
};

export type ClientForCoverage = {
  name: string;
  attachedServiceNames: string[];
};

// Both the gap report and its reverse ("who has it") are views derived
// client-side from this same full category list, so they always agree on
// the exact same categorization from one AI call instead of two that
// could disagree.
export type ServiceCoverageCategory = {
  category: string;
  matchedServices: string[];
  coveredClients: string[];
  missingClients: string[];
};

const TOOL_NAME = "report_service_coverage";
const TOOL_DESCRIPTION =
  "Report every real category of service found, and which clients have nothing matching it.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "A short name for the category, e.g. \"MDR / endpoint detection and response\" or \"Backup\" — your own label, not necessarily a service's exact name.",
          },
          matched_services: {
            type: "array",
            items: { type: "string" },
            description:
              "Which service names you grouped into this category (e.g. [\"Huntress MDR\", \"SentinelOne MDR\"]) — must be real names from the list given, not invented.",
          },
          missing_clients: {
            type: "array",
            items: { type: "string" },
            description:
              "Client names that have NONE of matched_services (or anything else that reads as the same category) attached. Leave empty if every client is covered.",
          },
        },
        required: ["category", "matched_services", "missing_clients"],
      },
    },
  },
  required: ["categories"],
} as const;

function buildPrompt(services: CatalogServiceForCoverage[], clients: ClientForCoverage[]): string {
  const serviceList = services
    .map((s) => `- "${s.name}"${s.description ? `: ${s.description}` : ""}`)
    .join("\n");

  const clientList = clients
    .map(
      (c) =>
        `- ${c.name}: ${c.attachedServiceNames.length > 0 ? c.attachedServiceNames.join(", ") : "(nothing attached)"}`
    )
    .join("\n");

  return `You're reviewing an MSP's service catalog and which services each client currently has attached, grouping into real CATEGORIES of protection so coverage can be checked even when the exact product differs from client to client.

Service catalog (what's offered, with a description if one was given):
${serviceList}

Clients and the catalog services they currently have attached:
${clientList}

Group the catalog into real categories by what the services actually do (infer this from the names and descriptions — e.g. "Huntress MDR" and "SentinelOne MDR" are both MDR/endpoint detection and response, even though they're different vendors and neither name matches the other exactly). For EVERY category you identify — not just ones with a gap — list which clients have NONE of that category's services attached (missing_clients). A client with ANY service in that category — any vendor, any exact name — is NOT missing; only list a client under a category if they truly have nothing matching it.

Don't invent a category that isn't actually represented by a real catalog entry. Report every real category you find, even ones where missing_clients ends up empty because every client is already covered.

Use the ${TOOL_NAME} tool.`;
}

/** Returns every category the AI identified, each with the clients missing
 * it (as reported by the model) and the clients covered (computed here,
 * not asked of the model — it's just "everyone else on the known client
 * list," which keeps the model's job to the one judgment call it's
 * actually needed for and keeps its output the same size regardless of
 * how many categories/clients exist). */
export async function analyzeServiceCoverage(
  services: CatalogServiceForCoverage[],
  clients: ClientForCoverage[],
  settings: ActiveAiSettings
): Promise<ServiceCoverageCategory[]> {
  if (services.length === 0 || clients.length === 0) return [];

  const allClientNames = clients.map((c) => c.name);
  const prompt = buildPrompt(services, clients);
  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  const raw = Array.isArray(parsed?.categories) ? parsed.categories : [];
  return raw
    .map(
      (c: {
        category?: unknown;
        matched_services?: unknown;
        missing_clients?: unknown;
      }): ServiceCoverageCategory => {
        const missingClients = Array.isArray(c.missing_clients)
          ? c.missing_clients.filter((n): n is string => typeof n === "string")
          : [];
        const missingSet = new Set(missingClients);
        return {
          category: typeof c.category === "string" ? c.category : "",
          matchedServices: Array.isArray(c.matched_services)
            ? c.matched_services.filter((s): s is string => typeof s === "string")
            : [],
          missingClients,
          coveredClients: allClientNames.filter((name) => !missingSet.has(name)),
        };
      }
    )
    .filter((c: ServiceCoverageCategory) => c.category);
}

async function callAnthropicTool(
  prompt: string,
  apiKey: string,
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  assertAsciiHeaderValue(apiKey, "AI provider API key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolUse = (json.content ?? []).find((block: { type: string }) => block.type === "tool_use");
  return toolUse?.input ?? {};
}

async function callOpenAiTool(
  prompt: string,
  apiKey: string,
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  assertAsciiHeaderValue(apiKey, "AI provider API key");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      tools: [
        { type: "function", function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: TOOL_SCHEMA } },
      ],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return {};

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return {};
  }
}
