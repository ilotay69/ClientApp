import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getPortalContext } from "@/lib/portal";
import { QUARTERLY_REVIEW_PDF_BUCKET } from "@/lib/quarterly-review-data";

export const dynamic = "force-dynamic";

/**
 * Redirects to a short-lived signed URL for a sent review's PDF — reusable
 * from three places: the Quarterly Reviews workflow pages (any staff with
 * manage_quarterly_reviews), a client's own record in Clients (any staff
 * who can view clients at all, not just quarterly-review managers), and
 * that client's own portal login (their own reviews only).
 *
 * Everything here reads through the service-role client and does its own
 * authorization in code rather than relying on storage RLS — same
 * reasoning as every portal data read elsewhere in this app: a role='client'
 * login has no useful direct table/storage access under RLS at all.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: review } = await admin
    .from("quarterly_reviews")
    .select("client_id, status, pdf_storage_path")
    .eq("id", id)
    .maybeSingle();

  // Never available before it's actually been sent — draft/submitted/
  // approved reviews aren't for a client (or a non-manager tech) to see.
  if (!review || review.status !== "sent" || !review.pdf_storage_path) {
    return NextResponse.json({ error: "No sent PDF available for this review." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const allowedAsStaff = await hasPermission(supabase, "view_clients");
  let allowedAsClient = false;
  if (!allowedAsStaff) {
    const portalContext = await getPortalContext();
    allowedAsClient = portalContext.state === "ok" && portalContext.client.clientId === review.client_id;
  }
  if (!allowedAsStaff && !allowedAsClient) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data, error } = await admin.storage
    .from(QUARTERLY_REVIEW_PDF_BUCKET)
    .createSignedUrl(review.pdf_storage_path, 60);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
