/* PTopup Service Worker — Web Push + click handling.
 *
 * Sengaja minimal: tidak melakukan precaching agar tidak menyajikan HTML basi
 * (app diakses lewat TWA/PWA, konten selalu fresh dari server). Tugas SW di sini
 * murni untuk menerima push & membuka halaman saat notifikasi diklik.
 */

self.addEventListener("install", (event) => {
  // Aktifkan versi baru tanpa menunggu tab lama ditutup.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "PTopup", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "PTopup";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Fokuskan tab yang sudah terbuka kalau ada, lalu arahkan.
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              client.navigate(targetUrl).catch(() => {});
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
