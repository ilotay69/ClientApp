import { callAnthropic, ANTHROPIC_DEFAULT_MODEL } from "./anthropic";
import { callOpenAI, OPENAI_DEFAULT_MODEL } from "./openai";
import type { GeneratedSuggestion } from "./schema";

export type { GeneratedSuggestion, SuggestionKind, SuggestionPriority } from "./schema";

export type AiProvider = "anthropic" | "openai";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
};

export const AI_PROVIDER_DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  openai: OPENAI_DEFAULT_MODEL,
};

export type ActiveAiSettings = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export function generateClientSuggestions(
  prompt: string,
  settings: ActiveAiSettings
): Promise<GeneratedSuggestion[]> {
  if (settings.provider === "openai") {
    return callOpenAI(prompt, settings.apiKey, settings.model);
  }
  return callAnthropic(prompt, settings.apiKey, settings.model);
}
