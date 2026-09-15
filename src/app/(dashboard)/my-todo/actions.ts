"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchTicketById } from "@/lib/autotask";

/** One ticket's description, fetched only when a My Tickets row is
 * expanded — never bulk-fetched with the rest of the list. Gated by
 * requireStaff (not a specific permission) since this only ever shows a
 * ticket already listed in the signed-in user's own My Tickets, not an
 * arbitrary one — same posture as the list itself. */
export async function fetchMyTicketDescriptionAction(
  ticketId: number
): Promise<{ description: string | null } | { error: string }> {
  if (!(await requireStaff())) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    // Only the description is used here, so the label maps fetchTicketById
    // needs for status/priority text can stay empty.
    const ticket = await fetchTicketById(settings.credentials, settings.zoneUrl, ticketId, {
      status: new Map(),
      priority: new Map(),
      queue: new Map(),
      sla: new Map(),
    });
    return { description: ticket?.description ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load ticket description." };
  }
}
