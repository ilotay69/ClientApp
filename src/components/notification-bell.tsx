"use client";

import { useEffect, useState } from "react";
import { IconBell, IconBellOff } from "@/components/icons";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/app/(dashboard)/push-actions";

type Status = "unsupported" | "denied" | "loading" | "off" | "on";

// PushManager.subscribe wants the VAPID public key as a raw byte array, not
// the base64url string it's stored/passed around as everywhere else.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationBell() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    (async () => {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setStatus("loading");
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      if (!result.ok) {
        await subscription.unsubscribe();
        setStatus("off");
        return;
      }
      setStatus(Notification.permission === "denied" ? "denied" : "on");
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  async function disable() {
    setStatus("loading");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
    } finally {
      setStatus("off");
    }
  }

  if (status === "unsupported") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-white/60" title="Notifications are blocked in your browser's site settings.">
        Notifications blocked
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "loading"}
      onClick={status === "on" ? disable : enable}
      className="flex w-full items-center gap-2 rounded-md border border-white/25 px-3 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-60"
    >
      {status === "on" ? <IconBell className="h-4 w-4" /> : <IconBellOff className="h-4 w-4" />}
      {status === "loading" ? "…" : status === "on" ? "Notifications on" : "Enable notifications"}
    </button>
  );
}
