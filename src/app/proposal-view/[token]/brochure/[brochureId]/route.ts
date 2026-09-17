import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { PROPOSAL_BROCHURES_BUCKET, resolveProposalBrochureForToken } from "@/lib/proposal-brochures";

export const dynamic = "force-dynamic";

/**
 * Opens a brochure attached to one proposal — the link the prospect's page
 * points its "opens in a new tab" links at.
 *
 * Public, like the rest of /proposal-view, but doesn't stop at the token:
 * resolveProposalBrochureForToken also checks that brochureId is actually
 * checked for the proposal that token resolves to, so this can't be used to
 * fetch an arbitrary library file by guessing an id — only files that
 * proposal was actually given.
 *
 * No login on this route (same reasoning as the rest of /proposal-view),
 * so it mints its own short-lived signed URL via the service-role admin
 * client rather than relying on any session-based storage policy, and
 * redirects to it. Inline by default — a PDF opens right in the new tab
 * this link targets, matching /api/documents' same default.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; brochureId: string }> }
) {
  const { token, brochureId } = await params;
  const admin = createAdminClient();

  const brochure = await resolveProposalBrochureForToken(token, brochureId, admin);
  if (!brochure) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from(PROPOSAL_BROCHURES_BUCKET)
    .createSignedUrl(brochure.storagePath, 300);

  if (error || !data) {
    return NextResponse.json({ error: "Could not open that file." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
