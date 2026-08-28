"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function updateMemberRole(memberId: string, role: UserRole) {
  const supabase = await createClient();

  // Guard: only an admin may change roles. RLS also enforces this, but we
  // check here too so a non-admin gets a clear no-op instead of a silent
  // RLS-denied update.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "director") return;

  await supabase.from("profiles").update({ role }).eq("id", memberId);
  revalidatePath("/team");
}
