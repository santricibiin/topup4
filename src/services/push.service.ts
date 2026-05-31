/**
 * Push Service — layer low-level Web Push (PWA/TWA).
 *
 * Tanggung jawab:
 *  - Konfigurasi VAPID (sekali, lazy saat pertama dipakai).
 *  - CRUD subscription (simpan/hapus endpoint device).
 *  - Kirim payload ke 1 subscription, prune otomatis kalau ditolak (404/410).
 *  - Broadcast ke semua subscription milik 1 user.
 *
 * Business-logic notifikasi (template, opt-in, event mana yang memicu) ada di
 * push-notify.service.ts — service ini sengaja "bodoh" dan reusable.
 *
 * Catatan keamanan: p256dh & auth adalah kunci enkripsi payload. JANGAN
 * pernah di-log. Endpoint juga sebaiknya tidak di-log utuh (mengandung token).
 */
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/config/env";

/** Payload yang dikirim ke service worker (lihat public/sw.js). */
export interface PushPayload {
  title: string;
  body: string;
  /** URL tujuan saat notifikasi diklik (relatif, mis. "/transaction/PT-123"). */
  url?: string;
  /** Tag dipakai untuk meng-collapse notifikasi sejenis (mis. per orderId). */
  tag?: string;
  /** Override icon (default pakai icon dari manifest). */
  icon?: string;
}

class PushService {
  private vapidReady = false;

  /** True kalau VAPID key lengkap di env — tanpa ini push tidak bisa jalan. */
  isConfigured(): boolean {
    return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  }

  /** Set VAPID details sekali. Idempotent & aman dipanggil berulang. */
  private ensureVapid(): boolean {
    if (this.vapidReady) return true;
    if (!this.isConfigured()) return false;

    const subject = env.VAPID_SUBJECT?.trim();
    // web-push wajib subject berupa mailto: atau URL https.
    const normalizedSubject =
      subject && (subject.startsWith("mailto:") || subject.startsWith("https://"))
        ? subject
        : "mailto:admin@localhost";

    webpush.setVapidDetails(
      normalizedSubject,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    this.vapidReady = true;
    return true;
  }

  /**
   * Simpan / refresh subscription milik user. Idempotent terhadap endpoint:
   * kalau endpoint sudah ada, update kepemilikan & key (device re-subscribe).
   */
  async saveSubscription(args: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  }): Promise<void> {
    const { userId, endpoint, p256dh, auth, userAgent } = args;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent: userAgent ?? null },
      update: { userId, p256dh, auth, userAgent: userAgent ?? null },
    });
    logger.info("push.subscribe", { userId });
  }

  /** Hapus subscription berdasarkan endpoint (mis. user matikan notif di device). */
  async removeSubscription(endpoint: string): Promise<void> {
    await prisma.pushSubscription
      .delete({ where: { endpoint } })
      .catch(() => undefined); // sudah tidak ada → no-op
  }

  /** Jumlah subscription aktif milik user. */
  async countForUser(userId: string): Promise<number> {
    return prisma.pushSubscription.count({ where: { userId } });
  }

  /**
   * Kirim 1 payload ke semua device milik user.
   * - Tidak melempar error (fire-and-forget friendly).
   * - Subscription yang ditolak permanen (404/410) di-prune.
   * @returns jumlah notifikasi yang sukses terkirim.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.ensureVapid()) {
      logger.info("push.skip.notConfigured", {});
      return 0;
    }

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payload);
    const staleEndpoints: string[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (sub) => {
        const target: WebPushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(target, body);
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 404/410 = subscription mati permanen → hapus.
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            logger.warn("push.send.fail", { userId, statusCode });
          }
        }
      }),
    );

    if (staleEndpoints.length > 0) {
      await prisma.pushSubscription
        .deleteMany({ where: { endpoint: { in: staleEndpoints } } })
        .catch(() => undefined);
      logger.info("push.prune", { userId, pruned: staleEndpoints.length });
    }

    return sent;
  }
}

export const pushService = new PushService();
