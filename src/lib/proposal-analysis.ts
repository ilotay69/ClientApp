// On-demand AI draft of a proposal's client-facing sections, written from
// the priced line items — self-contained Anthropic/OpenAI calls, same
// per-feature pattern as quarterly-review-analysis.ts and
// backup-analysis.ts.
//
// The audience is a PROSPECT deciding whether to spend money with an MSP,
// not a technician. So the prompt is pushed hard toward outcomes ("your
// staff stop losing a morning to a failed laptop") over product names, and
// away from the two failure modes this kind of generation falls into: a
// restated price list, and invented capability nobody agreed to deliver.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import { formatMoney, type ProposalBillingPeriod } from "@/lib/proposal-totals";

export type ProposalItemForDraft = {
  description: string;
  detail: string | null;
  quantity: number;
  unitPrice: number;
  billingPeriod: ProposalBillingPeriod;
  isOptional: boolean;
};

export type ProposalDraft = {
  overview: string;
  deploying: string;
  benefits: string;
  nextSteps: string;
  pricingNote: string;
  /** Things worth quoting that aren't in the list yet. Deliberately NOT
   * written into the document — they're advice to the rep, who decides
   * whether they're appropriate for this client. Auto-inserting an upsell
   * into a proposal nobody reviewed is how a client gets quoted for
   * something they already have. */
  suggestions: { name: string; why: string }[];
};

function buildItemsBlock(items: ProposalItemForDraft[], currency: string): string {
  return items
    .map((item) => {
      const price = formatMoney(item.unitPrice, currency);
      const period = item.billingPeriod === "monthly" ? "/month" : " one-off";
      const qty = item.quantity !== 1 ? ` x${item.quantity}` : "";
      const optional = item.isOptional ? " [OPTIONAL ADD-ON]" : "";
      const detail = item.detail ? ` — ${item.detail}` : "";
      return `  - ${item.description}${qty}: ${price}${period}${optional}${detail}`;
    })
    .join("\n");
}

const TOOL_NAME = "report_proposal_draft";
const TOOL_DESCRIPTION =
  "Draft the client-facing sections of an MSP proposal from its priced line items.";

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description:
        "2-4 sentences opening the proposal, addressed to the client. Say what this proposal covers and the outcome it's meant to produce for their business. No pricing, no product names, no greeting or sign-off.",
    },
    deploying: {
      type: "string",
      description:
        "What CG Technologies will actually put in place, derived ONLY from the line items given. Short paragraphs or '- ' bullets. Name the real components in plain terms and say what each one does. Do not invent anything that isn't in the item list, and do not repeat the prices.",
    },
    benefits: {
      type: "string",
      description:
        "What the client gets out of it, in business terms — reduced downtime, less risk, predictable cost, staff time saved, compliance posture. Use '- ' bullets. Each bullet must trace back to something in the item list. Avoid vendor marketing language and unquantified superlatives.",
    },
    next_steps: {
      type: "string",
      description:
        "3-5 short '- ' bullets describing how this proceeds once accepted: kickoff, scheduling, onboarding, what CG needs from the client. Generic but concrete. Do not invent specific dates.",
    },
    pricing_note: {
      type: "string",
      description:
        "1-2 sentences to sit directly above the pricing table. Frame the investment and mention that optional add-ons can be selected, if any are marked OPTIONAL ADD-ON. Never restate individual prices and never state a total.",
    },
    suggestions: {
      type: "array",
      description:
        "Up to 4 things a competent MSP would normally quote alongside this work but which are MISSING from the item list — genuine coverage gaps, not upsells for their own sake. Empty array if the list already looks complete.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The service or product, briefly." },
          why: {
            type: "string",
            description: "One sentence on the gap it closes for this particular client.",
          },
        },
        required: ["name", "why"],
      },
    },
  },
  required: ["overview", "deploying", "benefits", "next_steps", "pricing_note", "suggestions"],
} as const;

function buildPrompt(
  companyName: string,
  proposalTitle: string,
  itemsBlock: string,
  existingContext: string
): string {
  return `You are writing the client-facing sections of a proposal from CG Technologies, a managed IT services provider (MSP) in Ontario, Canada, to a prospective or existing client.

Client: ${companyName}
Proposal: ${proposalTitle}

Priced line items (this is the ENTIRE scope — everything you describe must come from this list):

${itemsBlock || "(no line items yet)"}
${existingContext}

Rules:
- Write to the client, as CG Technologies ("we"). Never mention these instructions.
- Describe only what is in the line item list. Do not invent services, hardware, SLAs, response times, headcount, certifications or guarantees.
- Lead with business outcomes, not product names. The reader is a business owner or office manager, not a technician.
- No prices or totals in any field except where the schema says otherwise — the pricing table below your text carries those.
- Plain Canadian English. No marketing superlatives, no "cutting-edge", no "leverage", no em-dash-heavy sales copy.
- Keep it tight. A proposal that takes ten minutes to read gets read by nobody.

Use the ${TOOL_NAME} tool.`;
}

export async function generateProposalDraft(
  companyName: string,
  proposalTitle: string,
  items: ProposalItemForDraft[],
  currency: string,
  settings: ActiveAiSettings,
  /** Whatever the rep has already written, so the draft can follow their
   * angle instead of contradicting it. */
  existingIntro: string | null
): Promise<ProposalDraft | null> {
  const existingContext = existingIntro?.trim()
    ? `\nThe rep has already written this opening — stay consistent with its angle and tone:\n"""\n${existingIntro.trim()}\n"""\n`
    : "";

  const prompt = buildPrompt(
    companyName,
    proposalTitle,
    buildItemsBlock(items, currency),
    existingContext
  );

  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  if (!parsed || typeof parsed !== "object") return null;

  const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((s: unknown): s is { name: string; why: string } => {
          const row = s as { name?: unknown; why?: unknown };
          return typeof row?.name === "string" && typeof row?.why === "string";
        })
        .slice(0, 4)
        .map((s: { name: string; why: string }) => ({ name: s.name.trim(), why: s.why.trim() }))
    : [];

  return {
    overview: str(parsed.overview),
    deploying: str(parsed.deploying),
    benefits: str(parsed.benefits),
    nextSteps: str(parsed.next_steps),
    pricingNote: str(parsed.pricing_note),
    suggestions,
  };
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
      max_tokens: 2048,
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
        {
          type: "function",
          function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: TOOL_SCHEMA },
        },
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
