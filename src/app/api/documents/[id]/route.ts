import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for an uploaded client document
 * (a signed quote or quarterly review PDF). The storage bucket is private,
 * so nothing links to a file's storage path directly — every download goes
 * through this route, minting a fresh URL rather than embedding one that
 * could go stale in cached page HTML.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    .createSignedUrl(interaction.attachment_path, 60, {
      download: interaction.attachment_filename ?? true,
    });

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
