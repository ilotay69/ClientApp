import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";
import { QUARTERLY_REVIEW_ATTACHMENTS_BUCKET } from "@/lib/quarterly-review-data";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for a quarterly review screenshot —
 * same private-bucket-plus-fresh-signed-URL mechanism as
 * /api/resumes/[id]/route.ts. Used both for the inline <img> thumbnails on
 * the review page and for opening the full image in a new tab.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("quarterly_review_attachments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!attachment?.storage_path) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.storage_path, 60);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
