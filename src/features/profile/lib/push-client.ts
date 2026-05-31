/**
 * Helper client-side untuk Web Push: registrasi service worker, subscribe /
 * unsubscribe lewat PushManager, dan sinkronisasi ke server.
 *
 * Semua fungsi aman dipanggil di browser yang tidak mendukung push — akan
 * mengembalikan status "unsupported" alih-alih melempar error.
 */

export type PushSupport = {
  supported: boolean;
  reason?: string;
};

/** Cek dukungan browser untuk service worker + push + notification. */
export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "server" };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "Service Worker tidak didukung browser ini." };
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "Push API tidak didukung browser ini." };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "Notification API tidak didukung browser ini." };
  }
  return { supported: true };
}

/** Konversi VAPID public key (base64url) → Uint8Array untuk applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Pastikan service worker terdaftar, kembalikan registration-nya. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Status notifikasi saat ini di device. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Subscribe device ke push & kirim subscription ke server.
 * Melempar Error dengan pesan ramah kalau gagal (permission ditolak, dll).
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<void> {
  const support = getPushSupport();
  if (!support.supported) {
    throw new Error(support.reason ?? "Perangkat tidak mendukung notifikasi.");
  }
  if (!vapidPublicKey) {
    throw new Error("Server belum mengaktifkan push notification.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "Izin notifikasi ditolak. Aktifkan lewat pengaturan browser/aplikasi.",
    );
  }

  const registration = await ensureServiceWorker();
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data?.error?.message ?? "Gagal menyimpan subscription.");
  }
}

/** Unsubscribe device & hapus dari server. */
export async function unsubscribeFromPush(): Promise<void> {
  const support = getPushSupport();
  if (!support.supported) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

/** Cek apakah device ini sudah punya subscription aktif. */
export async function hasActiveSubscription(): Promise<boolean> {
  const support = getPushSupport();
  if (!support.supported) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
