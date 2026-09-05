"use server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { checkDomainHealth, type DomainHealthReport } from "@/lib/domain-health";

export async function checkDomainHealthAction(
  domain: string
): Promise<{ report: DomainHealthReport } | { error: string }> {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_domain_health"))) {
    return { error: "You don't have permission to do that." };
  }

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
