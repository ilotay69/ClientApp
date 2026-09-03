import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for an uploaded client document
 * (a signed quote or quarterly review). The storage bucket is private, so
 * nothing links to a file's storage path directly — every access goes
 * through this route, minting a fresh URL rather than embedding one that
 * could go stale in cached page HTML.
 *
 * Defaults to an inline view (no Content-Disposition: attachment header) —
 * a PDF opens right in the browser tab. Pass ?download=1 to force a save.
 * A Word doc has no native browser renderer either way, so "view" on one
 * just becomes a download/open-in-app depending on the browser — nothing
 * this route can change about that.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: interaction } = await supabase
    .from("client_interactions")
    .select("attachment_path, attachment_filename")
    .eq("id", id)
    .maybeSingle();

  if (!interaction?.attachment_path) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("client-documents")
    .createSignedUrl(
      interaction.attachment_path,
      60,
      forceDownload ? { download: interaction.attachment_filename ?? true } : undefined
    );

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
