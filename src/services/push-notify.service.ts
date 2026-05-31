/**
 * Push Notify Service — kirim Web Push ke user untuk event bisnis.
 *
 * Mirror dari wa-notify.service.ts tapi untuk channel Web Push (PWA/TWA).
 * Dipanggil fire-and-forget dari transaction.service.ts & deposit.service.ts.
 * TIDAK boleh melempar error yang membatalkan flow bisnis.
 *
 * Gating (semua harus true):
 *   - VAPID key terisi  (pushService.isConfigured)
 *   - master switch ON  (setting push.enabled)
 *   - user opt-in       (User.notifPush, default true)
 *   - user punya >=1 subscription device
 */
import { TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { formatIDR } from "@/lib/money";
import { settingsService } from "@/services/settings.service";
import { pushService } from "@/services/push.service";

class PushNotifyService {
  /** Cek master switch + VAPID. Dipakai sebelum query user spesifik. */
  private async canSend(): Promise<boolean> {
    if (!pushService.isConfigured()) return false;
    const cfg = await settingsService.getPushConfig();
    return cfg.enabled;
  }

  /** Notifikasi perubahan status transaksi (PAID / SUCCESS / FAILED). */
  async notifyTransactionStatus(args: {
    transactionId: string;
    status: TransactionStatus;
  }): Promise<void> {
    try {
      if (!(await this.canSend())) return;

      const tx = await prisma.transaction.findUnique({
        where: { id: args.transactionId },
        include: { user: { select: { id: true, notifPush: true } } },
      });
      if (!tx?.user || !tx.user.notifPush) return;

      const branding = await settingsService.getSiteBranding();
      const payload = this.buildTxPayload(args.status, {
        siteName: branding.name,
        orderId: tx.orderId,
        productName: tx.productName,
        customerNo: tx.customerNo,
        providerSn: tx.providerSn,
        providerMessage: tx.providerMessage,
      });
      if (!payload) return; // status tanpa notifikasi (mis. PENDING/PROCESSING)

      await pushService.sendToUser(tx.user.id, {
        ...payload,
        url: `/transaction/${tx.orderId}`,
        tag: `tx-${tx.orderId}`,
      });
    } catch (err) {
      logger.warn("push.notify.tx.failed", {
        transactionId: args.transactionId,
        status: args.status,
        err: String(err),
      });
    }
  }

  /** Notifikasi saldo berhasil masuk (deposit SUCCESS). */
  async notifyDepositSuccess(depositId: string): Promise<void> {
    try {
      if (!(await this.canSend())) return;

      const deposit = await prisma.deposit.findUnique({
        where: { id: depositId },
        include: { user: { select: { id: true, notifPush: true } } },
      });
      if (!deposit?.user || !deposit.user.notifPush) return;
      if (deposit.status !== "SUCCESS") return;

      const branding = await settingsService.getSiteBranding();
      const nominal = formatIDR(deposit.amount.toString());

      await pushService.sendToUser(deposit.user.id, {
        title: `${branding.name} — Saldo Masuk`,
        body: `Deposit ${nominal} berhasil. Saldo kamu sudah ditambahkan.`,
        url: `/deposit/${deposit.id}`,
        tag: `deposit-${deposit.id}`,
      });
    } catch (err) {
      logger.warn("push.notify.deposit.failed", {
        depositId,
        err: String(err),
      });
    }
  }

  /** Bangun title/body sesuai status. Return null kalau status tak perlu notif. */
  private buildTxPayload(
    status: TransactionStatus,
    tx: {
      siteName: string;
      orderId: string;
      productName: string;
      customerNo: string;
      providerSn: string | null;
      providerMessage: string | null;
    },
  ): { title: string; body: string } | null {
    const dest = `${tx.productName} · ${tx.customerNo}`;
    switch (status) {
      case TransactionStatus.PAID:
        return {
          title: `${tx.siteName} — Pembayaran Diterima`,
          body: `Order ${tx.orderId} (${dest}) sedang diproses.`,
        };
      case TransactionStatus.SUCCESS:
        return {
          title: `${tx.siteName} — Transaksi Berhasil ✅`,
          body: tx.providerSn
            ? `Order ${tx.orderId} sukses. SN: ${tx.providerSn}`
            : `Order ${tx.orderId} (${dest}) sukses.`,
        };
      case TransactionStatus.FAILED:
      case TransactionStatus.REFUNDED:
        return {
          title: `${tx.siteName} — Transaksi Gagal ❌`,
          body: `Order ${tx.orderId} gagal. ${
            tx.providerMessage ?? "Saldo dikembalikan otomatis."
          }`,
        };
      default:
        return null;
    }
  }
}

export const pushNotifyService = new PushNotifyService();
