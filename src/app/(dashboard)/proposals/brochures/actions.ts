"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { PROPOSAL_BROCHURES_BUCKET } from "@/lib/proposal-brochures";

export type FormState = { error: string | null };

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, boolean> = {
  "application/pdf": true,
  "image/png": true,
  "image/jpeg": true,
};

export async function uploadProposalBrochureAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return { error: "You don't have permission to do that." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  // Same mislabeled-MIME-type tolerance as the client document uploader —
  // some browsers report a PDF/image as application/octet-stream.
  const extensionOk = /\.(pdf|png|jpe?g)$/i.test(file.name);
  if (!ACCEPTED_TYPES[file.type] && !extensionOk) {
    return { error: "Only PDF or image (.pdf, .png, .jpg) brochures are supported." };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is larger than 20MB." };

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${crypto.randomUUID()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(PROPOSAL_BROCHURES_BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { error: uploadError.message };

  const titleRaw = formData.get("title");
  const title = (typeof titleRaw === "string" ? titleRaw.trim() : "") || file.name;

  const { error } = await admin.from("proposal_brochures").insert({
    title,
    storage_path: path,
    file_name: file.name,
    content_type: file.type || null,
    file_size_bytes: file.size,
    created_by: user.id,
  });

  if (error) {
    // Don't leave an orphaned file in storage if the row failed.
    await admin.storage.from(PROPOSAL_BROCHURES_BUCKET).remove([path]);
    return { error: error.message };
  }

  revalidatePath("/proposals/brochures");
  return { error: null };
}

export async function deleteProposalBrochureAction(brochureId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: brochure } = await admin
    .from("proposal_brochures")
    .select("storage_path")
    .eq("id", brochureId)
    .maybeSingle();

  // Deleting the library row cascades proposal_brochure_links (130's own
  // on delete cascade), so any proposal that had it checked just quietly
  // loses that one attachment — no separate cleanup needed here.
  await admin.from("proposal_brochures").delete().eq("id", brochureId);
  if (brochure?.storage_path) {
    await admin.storage.from(PROPOSAL_BROCHURES_BUCKET).remove([brochure.storage_path]);
  }

  revalidatePath("/proposals/brochures");
  revalidatePath("/proposals");
}
