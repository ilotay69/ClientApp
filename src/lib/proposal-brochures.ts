import { createAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export const PROPOSAL_BROCHURES_BUCKET = "proposal-brochures";

export type ProposalBrochure = {
  id: string;
  title: string;
  storagePath: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

/** The whole library, for the management page and the per-proposal picker.
 * Small and staff-only, so a single unfiltered read is fine — no paging. */
export async function fetchProposalBrochures(
  admin: AdminClient = createAdminClient()
): Promise<ProposalBrochure[]> {
  const { data } = await admin
    .from("proposal_brochures")
    .select("id, title, storage_path, file_name, content_type, file_size_bytes, created_at")
    .order("title", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
    id: b.id as string,
    title: b.title as string,
    storagePath: b.storage_path as string,
    fileName: b.file_name as string,
    contentType: (b.content_type as string | null) ?? null,
    sizeBytes: (b.file_size_bytes as number | null) ?? null,
    createdAt: b.created_at as string,
  }));
}

/** Which library brochures are checked for one proposal — just the ids, for
 * the editor's checkbox list. */
export async function fetchLinkedBrochureIds(
  proposalId: string,
  admin: AdminClient = createAdminClient()
): Promise<string[]> {
  const { data } = await admin
    .from("proposal_brochure_links")
    .select("brochure_id")
    .eq("proposal_id", proposalId);
  return ((data ?? []) as { brochure_id: string }[]).map((r) => r.brochure_id);
}

/** The full brochure rows checked for one proposal — what the prospect page
 * links to and what the send action attaches. */
export async function fetchBrochuresForProposal(
  proposalId: string,
  admin: AdminClient = createAdminClient()
): Promise<ProposalBrochure[]> {
  const { data } = await admin
    .from("proposal_brochure_links")
    .select(
      "brochure_id, proposal_brochures(id, title, storage_path, file_name, content_type, file_size_bytes, created_at)"
    )
    .eq("proposal_id", proposalId);

  return ((data ?? []) as { proposal_brochures: Record<string, unknown> | Record<string, unknown>[] | null }[])
    .map((row) => {
      const b = Array.isArray(row.proposal_brochures) ? row.proposal_brochures[0] : row.proposal_brochures;
      if (!b) return null;
      return {
        id: b.id as string,
        title: b.title as string,
        storagePath: b.storage_path as string,
        fileName: b.file_name as string,
        contentType: (b.content_type as string | null) ?? null,
        sizeBytes: (b.file_size_bytes as number | null) ?? null,
        createdAt: b.created_at as string,
      };
    })
    .filter((b): b is ProposalBrochure => b !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Replaces the full set of brochures checked for a proposal with exactly
 * `brochureIds` — the checkbox list is a "what's checked right now" form,
 * not an incremental add/remove, so delete-then-insert is the correct
 * operation and avoids needing to diff against the previous set. */
export async function setProposalBrochureLinks(
  proposalId: string,
  brochureIds: string[],
  admin: AdminClient = createAdminClient()
): Promise<void> {
  await admin.from("proposal_brochure_links").delete().eq("proposal_id", proposalId);
  if (brochureIds.length === 0) return;
  await admin
    .from("proposal_brochure_links")
    .insert(brochureIds.map((brochureId) => ({ proposal_id: proposalId, brochure_id: brochureId })));
}

/** One resolved download for a specific proposal — used only by the public
 * token route. Returns null unless brochureId is actually linked to the
 * proposal that access_token resolves to, so the route can't be used to
 * fetch an arbitrary library file by guessing an id. */
export async function resolveProposalBrochureForToken(
  token: string,
  brochureId: string,
  admin: AdminClient = createAdminClient()
): Promise<ProposalBrochure | null> {
  const { data: proposal } = await admin
    .from("proposals")
    .select("id")
    .eq("access_token", token)
    .maybeSingle();
  if (!proposal) return null;

  const { data: link } = await admin
    .from("proposal_brochure_links")
    .select("proposal_brochures(id, title, storage_path, file_name, content_type, file_size_bytes, created_at)")
    .eq("proposal_id", proposal.id)
    .eq("brochure_id", brochureId)
    .maybeSingle();
  if (!link) return null;

  const b = Array.isArray(link.proposal_brochures) ? link.proposal_brochures[0] : link.proposal_brochures;
  if (!b) return null;

  return {
    id: b.id,
    title: b.title,
    storagePath: b.storage_path,
    fileName: b.file_name,
    contentType: b.content_type ?? null,
    sizeBytes: b.file_size_bytes ?? null,
    createdAt: b.created_at,
  };
}
