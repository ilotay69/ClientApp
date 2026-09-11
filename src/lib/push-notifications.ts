import { sendWebPush } from "@/lib/web-push";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type PushPayload = {
  title: string;
  body: string;
  /** App-relative path to open/focus when the notification is clicked. */
  url?: string;
};

/** Sends one push notification to every device a user has subscribed on.
 * Best-effort and silent by design — the caller's real action (a task
 * assignment, a candidate reply landing, etc.) must never fail or slow down
 * because a push couldn't be delivered, same convention as every other
 * notification path in this app. Prunes subscriptions the push service
 * reports as gone (404/410 — unsubscribed, cleared site data, uninstalled)
 * so they don't keep failing forever. */
export async function sendPushToUser(admin: Admin, userId: string, payload: PushPayload): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:ops@cgtechnologies.com";

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        const result = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          publicKey,
          privateKey,
          subject
        );
        if (!result.ok && (result.status === 404 || result.status === 410)) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else if (!result.ok) {
          console.error(`sendPushToUser: push failed (${result.status})`, result.body);
        }
      } catch (err) {
        console.error("sendPushToUser: push failed", err);
      }
    })
  );
}

export async function sendPushToUsers(admin: Admin, userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.all(userIds.map((id) => sendPushToUser(admin, id, payload)));
}

/** Every staff member holding a given permission — used for events with no
 * single obvious recipient (e.g. a candidate's plain reply, not tied to any
 * one interview), where "notify the whole team that owns this" is the
 * right call rather than picking one arbitrary person. Permissions are
 * role-based (see role_permissions/getMyPermissions in lib/permissions.ts),
 * and 'owner' holds every permission implicitly without a row there. */
export async function sendPushToPermissionHolders(
  admin: Admin,
  permission: string,
  payload: PushPayload
): Promise<void> {
  const { data: roleRows } = await admin
    .from("role_permissions")
    .select("role")
    .eq("permission", permission)
    .eq("enabled", true);
  const roles = Array.from(new Set(["owner", ...(roleRows ?? []).map((r: { role: string }) => r.role)]));

  const { data: profiles } = await admin.from("profiles").select("id").in("role", roles);
  const userIds = (profiles ?? []).map((p: { id: string }) => p.id);
  if (userIds.length === 0) return;
  await sendPushToUsers(admin, userIds, payload);
}
