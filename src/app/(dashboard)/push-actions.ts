"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";

/** Any signed-in staff member can turn notifications on for their own
 * device — this isn't gated by a specific permission, same reasoning as
 * every other purely-personal setting (a watched mail folder name, a
 * reminder preference). */
export async function savePushSubscriptionAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "You don't have permission to do that." };

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("savePushSubscriptionAction: upsert failed", error);
    return { ok: false, error: "Couldn't save that subscription." };
  }
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<void> {
  const user = await requireStaff();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
}
