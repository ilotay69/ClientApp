import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { assembleQuarterlyReviewPdf } from "@/lib/quarterly-review-data";

export const dynamic = "force-dynamic";

/**
 * Lets staff (the approver in particular, but anyone with
 * manage_quarterly_reviews) see exactly what the client PDF will look like
 * — generated fresh from the review's current data, in any status,
 * without emailing anything or touching the stored "sent" copy
 * (quarterly_reviews.pdf_storage_path, only ever written by an actual
 * send). Same assembler sendQuarterlyReviewToClientAction uses.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission("manage_quarterly_reviews"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const result = await assembleQuarterlyReviewPdf(id, admin);
  if (!result) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="quarterly-review-preview.pdf"',
    },
  });
}
