"use server";

import { createClient } from "@/lib/supabase/server";
import { checkDomainHealth, type DomainHealthReport } from "@/lib/domain-health";

/** Live DNS/RDAP checks only — nothing sensitive, nothing stored, so this
 * is open to any signed-in user rather than gated behind a permission. */
export async function checkDomainHealthAction(
  domain: string
): Promise<{ report: DomainHealthReport } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const trimmed = domain.trim();
  if (!trimmed) return { error: "Enter a domain." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) {
    return { error: "That doesn't look like a valid domain." };
  }

  try {
    const report = await checkDomainHealth(trimmed);
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }
}
