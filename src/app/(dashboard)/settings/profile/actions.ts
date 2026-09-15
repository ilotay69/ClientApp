"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; success: string | null };

/** Regular (not admin) client on purpose — the existing "profiles
 * updatable by self or admin" RLS policy already allows a user to update
 * their own row, which is exactly the constraint this action needs. */
export async function saveMyAutotaskResourceAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in.", success: null };

  const raw = String(formData.get("autotask_resource_id") ?? "").trim();
  const autotaskResourceId = raw === "" ? null : Number(raw);
  if (raw !== "" && !Number.isFinite(autotaskResourceId)) {
    return { error: "Invalid selection.", success: null };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ autotask_resource_id: autotaskResourceId })
    .eq("id", user.id);
  if (error) return { error: error.message, success: null };

  revalidatePath("/dashboard");
  revalidatePath("/my-todo");
  revalidatePath("/settings/profile");
  return { error: null, success: "Saved." };
}
