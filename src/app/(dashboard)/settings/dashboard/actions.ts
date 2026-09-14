"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; success: string | null };

/** Regular (not admin) client on purpose — RLS on dashboard_preferences
 * only allows a row's own user to read/write it (117_dashboard_preferences.sql),
 * which is exactly the constraint this action needs anyway. */
export async function saveDashboardWidgetPreferencesAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in.", success: null };

  const enabledWidgets = formData.getAll("widgets").map(String);

  const { error } = await supabase
    .from("dashboard_preferences")
    .upsert({ user_id: user.id, enabled_widgets: enabledWidgets }, { onConflict: "user_id" });
  if (error) return { error: error.message, success: null };

  revalidatePath("/dashboard");
  revalidatePath("/settings/dashboard");
  return { error: null, success: "Saved." };
}
