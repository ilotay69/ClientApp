"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncResumeFolder } from "@/lib/resume-sync";
import type { MailConnection } from "@/lib/types";

/** Updates the signed-in user's own watched folder name. One row per staff
 * user on mail_connections, same as every other per-user mailbox setting
 * this app already has (review_excludes, sync_excluded_senders, ...). */
export async function updateResumeFolderName(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const folderName = String(formData.get("folder_name") ?? "").trim();

  const { error } = await supabase
    .from("mail_connections")
    .update({ resume_folder_name: folderName || null })
    .eq("user_id", user.id);
  if (error) {
    console.error("updateResumeFolderName failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type ResumeSyncState = { ok: boolean; message: string };

/** Mirrors settings/mail's syncNow shape exactly — loads the caller's own
 * mail_connections row, calls the sync function, surfaces failures
 * (including an AADSTS53003-style token-refresh error) the same way that
 * existing action already does. Gated on manage_recruitment, unlike
 * syncNow: this is specifically the recruitment feature, not a general
 * personal-mailbox utility. */
export async function syncResumesNow(): Promise<ResumeSyncState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) {
    return { ok: false, message: "Connect your mailbox under Settings → Mailbox first." };
  }

  try {
    const result = await syncResumeFolder(admin, connection as MailConnection);
    revalidatePath("/recruitment");
    // TEMPORARY — appends fetchRawAttachmentDebugInfo's findings when
    // anything was skipped, so the actual Graph response shape is visible
    // without server-log access. Remove alongside ResumeSyncResult.debug
    // once "imported 0" is understood and fixed.
    const debugSuffix = result.debug.length > 0 ? ` ${result.debug.join(" | ")}` : "";
    return {
      ok: true,
      message: `Scanned ${result.scanned} message${result.scanned === 1 ? "" : "s"}, imported ${result.imported} new resume${result.imported === 1 ? "" : "s"}.${debugSuffix}`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sync failed." };
  }
}
