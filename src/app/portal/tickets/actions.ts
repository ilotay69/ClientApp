"use server";

import { requirePortalSession } from "@/lib/portal";
import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  fetchClientVisibleTicketNotes,
  ticketBelongsToCompany,
  type AutotaskClientTicketNote,
} from "@/lib/autotask";

export type TicketCommunicationResult =
  | { notes: AutotaskClientTicketNote[] }
  | { error: string };

/**
 * Ticket correspondence, fetched when a client expands a row rather than
 * up front — notes are one Autotask call per ticket, and pre-fetching them
 * for a 60-ticket list would mean 60 calls to render a page almost nobody
 * expands every row of.
 *
 * A Server Action is a POST endpoint in its own right: it does not inherit
 * anything from the page that rendered the button, so the full portal
 * guard runs here again, and the ticket id — which arrives from the
 * browser and is trivially editable — is checked against this client's own
 * Autotask company before a single note is read.
 */
export async function fetchTicketCommunicationAction(
  ticketId: number,
  preview?: string
): Promise<TicketCommunicationResult> {
  const session = await requirePortalSession(preview, "tickets");
  if (!session) return { error: "Not available." };

  const companyId = session.client.autotaskCompanyId;
  if (companyId == null) return { error: "This account isn't linked to Autotask yet." };

  if (!Number.isInteger(ticketId) || ticketId <= 0) return { error: "Unknown ticket." };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return { error: "Ticket data isn't available right now." };

  try {
    if (!(await ticketBelongsToCompany(settings.credentials, settings.zoneUrl, ticketId, companyId))) {
      // Deliberately the same message a genuinely missing ticket gets, so
      // this can't be used to probe which ticket numbers exist.
      return { error: "Unknown ticket." };
    }
    return { notes: await fetchClientVisibleTicketNotes(settings.credentials, settings.zoneUrl, ticketId) };
  } catch (err) {
    console.error("fetchTicketCommunicationAction failed", err);
    return { error: "Couldn't load this ticket's updates right now." };
  }
}
