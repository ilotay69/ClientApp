import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for a synced resume PDF. Copy of
 * /api/documents/[id]/route.ts's mechanism (private bucket, mint a fresh
 * signed URL rather than ever linking a storage path directly), with one
 * addition: an explicit staff check, not just "signed in". That existing
 * route relies on RLS alone (client-documents' bucket policies already
 * require public.is_staff(), same as this one) — which is real enforcement,
 * but candidate PII is sensitive enough to be worth the redundant, explicit
 * check here too rather than leaning on RLS being the only thing that
 * would catch a mistake.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const supabase = await createClient();

  const { data: resume } = await supabase
    .from("resumes")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (!resume?.storage_path) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(
      resume.storage_path,
      60,
      forceDownload ? { download: resume.file_name ?? true } : undefined
    );

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
