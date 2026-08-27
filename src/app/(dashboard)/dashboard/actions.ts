"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/suggestions";
import type { SuggestionStatus } from "@/lib/types";

export type RefreshState = { error: string | null; summary: string | null };

export async function refreshInsights(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: RefreshState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<RefreshState> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "AI insights aren't set up yet (no Anthropic API key configured).", summary: null };
  }

  const admin = createAdminClient();
  try {
    const result = await generateSuggestions(admin, { maxClients: 10 });
    revalidatePath("/dashboard");
    return {
      error: null,
      summary: `Checked ${result.clientsConsidered} client${result.clientsConsidered === 1 ? "" : "s"} with recent email activity, found ${result.created} new insight${result.created === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Refresh failed.", summary: null };
  }
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}
