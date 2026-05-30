/**
 * WhatsApp Notify Service — kirim notifikasi transaksi ke user opt-in.
 *
 * Dipanggil fire-and-forget dari transaction.service.ts. Tidak boleh
 * melempar error yang membatalkan flow transaksi.
 *
 * Cek opt-in:
 *   - global: setting `wa.feature.notifTx`
 *   - per user: User.notifWaTx (default true)
 *   - WA service connected
 *   - User punya nomor HP
 */

import { Transaction, User, TransactionStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";
import { prisma } from "@/lib/prisma";

interface NotifyTxArgs {
  transactionId: string;
  status: TransactionStatus;
}

class WaNotifyService {
  async notifyTransactionStatus({ transactionId, status }: NotifyTxArgs): Promise<void> {
    try {
      logger.info("wa.notify.start", { transactionId, status });
      const cfg = await settingsService.getWaConfig();
      logger.info("wa.notify.cfg", {
        enabled: cfg.enabled,
        featureNotifTx: cfg.featureNotifTx,
        waReady: waService.isReady(),
      });
      if (!cfg.enabled || !cfg.featureNotifTx) {
        logger.info("wa.notify.skip.disabled", {
          enabled: cfg.enabled,
          featureNotifTx: cfg.featureNotifTx,
        });
        return;
      }
      if (!waService.isReady()) {
        logger.info("wa.notify.skip.notReady", {});
        return;
      }

      const tx = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { user: true },
      });
      if (!tx || !tx.user) {
        logger.info("wa.notify.skip.noTx", { transactionId });
        return;
      }
      if (!tx.user.phone) {
        logger.info("wa.notify.skip.noPhone", { userId: tx.userId });
        return;
      }
      if (!tx.user.notifWaTx) {
        logger.info("wa.notify.skip.optedOut", { userId: tx.userId });
        return;
      }

      let template: string | null = null;
      if (status === TransactionStatus.PAID) template = cfg.tplTxPaid;
      else if (status === TransactionStatus.SUCCESS) template = cfg.tplTxSuccess;
      else if (
        status === TransactionStatus.FAILED ||
        status === TransactionStatus.REFUNDED
      )
        template = cfg.tplTxFailed;
      if (!template) {
        logger.info("wa.notify.skip.noTemplate", { status });
        return;
      }

      const branding = await settingsService.getSiteBranding();
      const text = this.renderTemplate(template, tx, tx.user, branding.name);
      logger.info("wa.notify.sending", {
        userId: tx.userId,
        phone: tx.user.phone,
        orderId: tx.orderId,
        textLen: text.length,
      });
      await waService.sendText(tx.user.phone, text);
      logger.info("wa.notify.sent", {
        userId: tx.userId,
        orderId: tx.orderId,
        status,
      });
    } catch (err) {
      // Jangan biarkan error notifikasi mengganggu transaksi
      logger.warn("wa.notify.failed", {
        transactionId,
        status,
        err: String(err),
      });
    }
  }

  private renderTemplate(
    template: string,
    tx: Transaction,
    _user: User,
    siteName: string,
  ): string {
    const snLine = tx.providerSn ? `SN: ${tx.providerSn}\n` : "";
    return waService.applyTemplate(template, {
      site: siteName,
      order_id: tx.orderId,
      produk: tx.productName,
      tujuan: tx.customerNo,
      sn_line: snLine,
      pesan: tx.providerMessage ?? "-",
    });
  }
}

export const waNotifyService = new WaNotifyService();
