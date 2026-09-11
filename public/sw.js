// Minimal service worker whose only job is handling Web Push — no offline
// caching/fetch interception, since this app always needs a live server
// round-trip anyway (Server Actions, live data) and a caching layer would
// just risk serving stale pages.

self.addEventListener("push", (event) => {
  let payload = { title: "CG Ops", body: "You have a new notification." };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Non-JSON push payload — fall back to the default above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "CG Ops", {
      body: payload.body,
      icon: "/icon-192",
      badge: "/icon-192",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin).href;

      for (const client of allClients) {
        if (client.url === target && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })()
  );
});
