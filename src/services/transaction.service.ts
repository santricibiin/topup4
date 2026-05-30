/**
 * Transaction Service — orchestrasi pembelian.
 *
 * Alur:
 * 1) checkout(): validasi produk → buat Transaction (PENDING)
 *    - Jika method = BALANCE: debit saldo (ACID), langsung lanjut ke executeProvider().
 *    - Jika method = DUITKU_*: bikin invoice Duitku, return paymentUrl.
 * 2) markPaid(): dipanggil oleh webhook Duitku setelah signature valid.
 *    - Update transaksi → PAID, lalu trigger executeProvider().
 * 3) executeProvider(): hit Digiflazz, update status sesuai response.
 * 4) applyDigiflazzCallback(): dipanggil webhook Digiflazz untuk finalisasi.
 *
 * Setiap perubahan saldo + status transaksi dibungkus prisma.$transaction().
 * Jika provider gagal → rollback otomatis (refund saldo).
 */
import { Prisma, PaymentMethod, TransactionStatus } from "@prisma/client";
import { TX_EXPIRY_MINUTES } from "@/config/constants";
import { env } from "@/config/env";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { generateOrderId } from "@/lib/order-id";
import { prisma } from "@/lib/prisma";
import { balanceService } from "./balance.service";
import { digiflazzService } from "./digiflazz.service";
import { duitkuService } from "./duitku.service";
import { gatewayLogService } from "./gateway-log.service";
import { waNotifyService } from "./wa-notify.service";

export interface CheckoutInput {
  userId: string;
  productSku: string;
  customerNo: string;
  serverId?: string;
  paymentMethod: PaymentMethod;
  paymentChannel?: string;
}

export interface CheckoutResult {
  orderId: string;
  status: TransactionStatus;
  paymentMethod: PaymentMethod;
  paymentUrl?: string;
  amount: string;
  expiredAt: Date;
}

export interface PostpaidInquiryInput {
  userId: string;
  productSku: string;
  customerNo: string;
}

export interface PostpaidInquiryResult {
  orderId: string;
  productName: string;
  customerNo: string;
  customerName: string;
  billAmount: string; // total yang harus dibayar user (sellPrice)
  baseAmount: string; // cost dari provider (basePrice)
  adminFee: string; // margin/biaya layanan
  desc: unknown; // detail tagihan mentah dari provider
  expiredAt: Date;
}

export interface PostpaidPayInput {
  userId: string;
  orderId: string;
}

export const transactionService = {
  /**
   * Checkout — buat transaksi + (debit saldo / create invoice).
   * Semua DB write dibungkus dalam $transaction.
   */
  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const product = await prisma.product.findUnique({
      where: { sku: input.productSku },
    });
    if (!product) throw Errors.notFound("Produk");
    if (product.status !== "ACTIVE") {
      throw Errors.conflict("Produk sedang tidak tersedia.");
    }

    const orderId = generateOrderId();
    const now = new Date();
    const expiredAt = new Date(now.getTime() + TX_EXPIRY_MINUTES * 60_000);

    const totalAmount = product.sellPrice; // adminFee bisa ditambah dari Duitku fee

    // 1) Buat transaksi (PENDING) di dalam $transaction.
    const tx = await prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          orderId,
          userId: input.userId,
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          basePrice: product.basePrice,
          sellPrice: product.sellPrice,
          adminFee: 0,
          totalAmount,
          customerNo: input.customerNo,
          serverId: input.serverId,
          paymentMethod: input.paymentMethod,
          paymentChannel: input.paymentChannel,
          expiredAt,
          status: TransactionStatus.PENDING,
        },
      });

      // Jika bayar pakai saldo: debit langsung di sini (ACID).
      if (input.paymentMethod === PaymentMethod.BALANCE) {
        await balanceService.debit(db, {
          userId: input.userId,
          amount: totalAmount,
          type: "PURCHASE",
          description: `Pembelian ${product.name}`,
          referenceId: created.id,
          referenceType: "TRANSACTION",
        });

        await db.transaction.update({
          where: { id: created.id },
          data: {
            status: TransactionStatus.PAID,
            paidAt: new Date(),
          },
        });
      }

      return created;
    });

    // 2) Untuk metode Duitku → buat invoice di luar $transaction (network call).
    if (input.paymentMethod !== PaymentMethod.BALANCE) {
      const channel = input.paymentChannel ?? "VC"; // default VC (Virtual Account BCA)
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
      });

      try {
        const invoice = await duitkuService.createInvoice({
          orderId,
          amount: Number(totalAmount),
          productName: product.name,
          paymentMethod: channel,
          customer: {
            email: user.email,
            name: user.fullName ?? user.username,
            phone: user.phone ?? undefined,
          },
          expiryMinutes: TX_EXPIRY_MINUTES,
        });

        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: tx.id },
            data: {
              paymentChannel: channel,
              paymentRef: invoice.reference,
              paymentUrl: invoice.paymentUrl,
            },
          }),
          prisma.paymentGatewayLog.create({
            data: {
              transactionId: tx.id,
              provider: "DUITKU",
              direction: "RESPONSE",
              endpoint: "/v2/inquiry",
              httpStatus: 200,
              payload: invoice as unknown as Prisma.InputJsonValue,
            },
          }),
        ]);

        return {
          orderId,
          status: TransactionStatus.PENDING,
          paymentMethod: input.paymentMethod,
          paymentUrl: invoice.paymentUrl,
          amount: totalAmount.toString(),
          expiredAt,
        };
      } catch (err) {
        // gagal create invoice → tandai transaksi FAILED
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            status: TransactionStatus.FAILED,
            providerMessage: "Gagal membuat invoice pembayaran.",
          },
        });
        throw err;
      }
    }

    // BALANCE → langsung eksekusi provider
    void this.executeProvider(tx.id).catch((e) =>
      logger.error("tx.executeProvider.async.fail", { id: tx.id, err: String(e) }),
    );

    // notif WA fire-and-forget untuk PAID (BALANCE flow)
    void waNotifyService.notifyTransactionStatus({
      transactionId: tx.id,
      status: TransactionStatus.PAID,
    });

    return {
      orderId,
      status: TransactionStatus.PAID,
      paymentMethod: input.paymentMethod,
      amount: totalAmount.toString(),
      expiredAt,
    };
  },

  /**
   * Tandai transaksi sebagai PAID (dipanggil dari webhook Duitku).
   * Triggers executeProvider() setelahnya.
   */
  async markPaid(orderId: string, paymentRef: string) {
    const tx = await prisma.transaction.findUnique({ where: { orderId } });
    if (!tx) throw Errors.notFound("Transaksi");

    if (
      tx.status === TransactionStatus.PAID ||
      tx.status === TransactionStatus.PROCESSING ||
      tx.status === TransactionStatus.SUCCESS
    ) {
      // idempotent — sudah pernah diproses
      return tx;
    }

    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: TransactionStatus.PAID,
        paidAt: new Date(),
        paymentRef,
      },
    });

    // notif WA fire-and-forget (tidak boleh ganggu flow)
    void waNotifyService.notifyTransactionStatus({
      transactionId: updated.id,
      status: TransactionStatus.PAID,
    });

    // jalankan provider (async)
    void this.executeProvider(updated.id).catch((e) =>
      logger.error("tx.executeProvider.async.fail", { id: updated.id, err: String(e) }),
    );

    return updated;
  },

  /**
   * Eksekusi order ke Digiflazz.
   * Idempotent: ref_id = orderId (Digiflazz akan deduplikasi sendiri).
   */
  async executeProvider(transactionId: string) {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw Errors.notFound("Transaksi");
    if (tx.status !== TransactionStatus.PAID) {
      logger.warn("tx.executeProvider.skip", { id: tx.id, status: tx.status });
      return tx;
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: TransactionStatus.PROCESSING },
    });

    try {
      const res = await digiflazzService.order({
        refId: tx.orderId,
        sku: tx.productSku,
        customerNo: tx.customerNo,
        cbUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/digiflazz`,
      });

      await gatewayLogService.write(prisma, {
        transactionId: tx.id,
        provider: "DIGIFLAZZ",
        direction: "RESPONSE",
        endpoint: "/transaction",
        httpStatus: 200,
        payload: res,
      });

      return await this.applyDigiflazzResult(tx.id, res);
    } catch (err) {
      logger.error("tx.executeProvider.fail", { id: tx.id, err: String(err) });
      // Refund saldo bila bayar pakai BALANCE.
      await this.failAndRefund(tx.id, "Gagal menghubungi provider.");
      throw err;
    }
  },

  /**
   * Refund + tandai FAILED. ACID.
   */
  async failAndRefund(transactionId: string, reason: string) {
    const result = await prisma.$transaction(async (db) => {
      const tx = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
      if (
        tx.status === TransactionStatus.FAILED ||
        tx.status === TransactionStatus.REFUNDED
      ) {
        return { tx, changed: false };
      }

      if (tx.paymentMethod === PaymentMethod.BALANCE) {
        await balanceService.credit(db, {
          userId: tx.userId,
          amount: tx.totalAmount,
          type: "REFUND",
          description: `Refund: ${reason}`,
          referenceId: tx.id,
          referenceType: "TRANSACTION",
        });
      }

      const updated = await db.transaction.update({
        where: { id: tx.id },
        data: {
          status: TransactionStatus.FAILED,
          providerMessage: reason,
        },
      });
      return { tx: updated, changed: true };
    });

    if (result.changed) {
      void waNotifyService.notifyTransactionStatus({
        transactionId: result.tx.id,
        status: TransactionStatus.FAILED,
      });
    }

    return result.tx;
  },

  /**
   * Apply hasil dari Digiflazz (response sync atau webhook).
   * - Sukses → SUCCESS, simpan SN.
   * - Gagal  → FAILED + refund (jika BALANCE).
   * - Pending → PROCESSING.
   */
  async applyDigiflazzResult(
    transactionId: string,
    data: { status: string; rc?: string; sn?: string; message?: string },
  ) {
    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
    });

    if (data.status === "Sukses") {
      const updated = await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: TransactionStatus.SUCCESS,
          providerSn: data.sn ?? null,
          providerMessage: data.message ?? "Sukses",
        },
      });
      void waNotifyService.notifyTransactionStatus({
        transactionId: updated.id,
        status: TransactionStatus.SUCCESS,
      });
      return updated;
    }

    if (data.status === "Gagal") {
      return this.failAndRefund(tx.id, data.message ?? "Gagal di provider");
    }

    // Pending
    return prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: TransactionStatus.PROCESSING,
        providerMessage: data.message ?? "Sedang diproses",
      },
    });
  },

  /** Helper: cari transaksi by orderId. */
  async findByOrderId(orderId: string) {
    return prisma.transaction.findUnique({ where: { orderId } });
  },

  // ============================================================
  // PASCABAYAR (Postpaid)
  // ============================================================

  /**
   * Cek tagihan (inquiry) pascabayar.
   * Membuat transaksi PENDING yang menyimpan hasil inquiry (nama pelanggan,
   * detail tagihan). Pembayaran dilakukan terpisah via payPostpaid() dengan
   * ref_id yang sama (syarat Digiflazz).
   *
   * Harga:
   *   basePrice  = inquiry.price (cost dari provider, sudah termasuk admin Digiflazz)
   *   margin     = product.sellPrice - product.basePrice (markup atas admin fee)
   *   sellPrice  = basePrice + margin  (yang dibayar user)
   */
  async inquiryPostpaid(input: PostpaidInquiryInput): Promise<PostpaidInquiryResult> {
    const product = await prisma.product.findUnique({
      where: { sku: input.productSku },
    });
    if (!product) throw Errors.notFound("Produk");
    if (!product.isPostpaid) {
      throw Errors.badRequest("Produk ini bukan produk pascabayar.");
    }
    if (product.status !== "ACTIVE") {
      throw Errors.conflict("Produk sedang tidak tersedia.");
    }

    const orderId = generateOrderId();
    const now = new Date();
    const expiredAt = new Date(now.getTime() + TX_EXPIRY_MINUTES * 60_000);

    let res;
    try {
      res = await digiflazzService.inquiryPostpaid({
        refId: orderId,
        sku: product.sku,
        customerNo: input.customerNo,
      });
    } catch (err) {
      logger.error("tx.inquiryPostpaid.fail", { orderId, err: String(err) });
      throw err;
    }

    // Status "Gagal" → tagihan tidak ditemukan / nomor salah / sudah lunas.
    if (res.status === "Gagal") {
      throw Errors.conflict(res.message || "Tagihan tidak ditemukan.");
    }

    // Hitung harga jual: cost (price provider) + margin produk.
    const margin = Math.max(
      0,
      Number(product.sellPrice) - Number(product.basePrice),
    );
    const baseAmount = Number(res.price);
    const sellAmount = baseAmount + margin;

    await prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          orderId,
          userId: input.userId,
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          basePrice: new Prisma.Decimal(baseAmount),
          sellPrice: new Prisma.Decimal(sellAmount),
          adminFee: new Prisma.Decimal(margin),
          totalAmount: new Prisma.Decimal(sellAmount),
          customerNo: input.customerNo,
          customerName: res.customer_name || null,
          paymentMethod: PaymentMethod.BALANCE,
          providerRef: res.ref_id,
          providerMessage: res.message || null,
          inquiryData: res as unknown as Prisma.InputJsonValue,
          expiredAt,
          status: TransactionStatus.PENDING,
        },
      });

      await gatewayLogService.write(db, {
        transactionId: created.id,
        provider: "DIGIFLAZZ",
        direction: "RESPONSE",
        endpoint: "/transaction (inq-pasca)",
        httpStatus: 200,
        payload: res,
      });
    });

    return {
      orderId,
      productName: product.name,
      customerNo: input.customerNo,
      customerName: res.customer_name || "",
      billAmount: sellAmount.toString(),
      baseAmount: baseAmount.toString(),
      adminFee: margin.toString(),
      desc: res.desc ?? null,
      expiredAt,
    };
  },

  /**
   * Bayar tagihan pascabayar.
   * Debit saldo (ACID) lalu eksekusi pay-pasca ke Digiflazz dengan ref_id
   * yang sama seperti saat inquiry. Refund otomatis bila provider gagal.
   */
  async payPostpaid(input: PostpaidPayInput) {
    const existing = await prisma.transaction.findUnique({
      where: { orderId: input.orderId },
    });
    if (!existing) throw Errors.notFound("Transaksi");
    if (existing.userId !== input.userId) throw Errors.forbidden();

    // Idempotent: kalau sudah diproses, kembalikan apa adanya.
    if (
      existing.status === TransactionStatus.PAID ||
      existing.status === TransactionStatus.PROCESSING ||
      existing.status === TransactionStatus.SUCCESS
    ) {
      return existing;
    }
    if (existing.status !== TransactionStatus.PENDING) {
      throw Errors.conflict("Transaksi tidak dapat dibayar.");
    }
    if (existing.expiredAt && existing.expiredAt.getTime() < Date.now()) {
      throw Errors.conflict("Tagihan sudah kedaluwarsa, silakan cek ulang.");
    }

    // 1) Debit saldo + tandai PAID (ACID).
    const paid = await prisma.$transaction(async (db) => {
      await balanceService.debit(db, {
        userId: existing.userId,
        amount: existing.totalAmount,
        type: "PURCHASE",
        description: `Pembayaran ${existing.productName} - ${existing.customerNo}`,
        referenceId: existing.id,
        referenceType: "TRANSACTION",
      });

      return db.transaction.update({
        where: { id: existing.id },
        data: {
          status: TransactionStatus.PAID,
          paidAt: new Date(),
        },
      });
    });

    // 2) Eksekusi pembayaran ke provider (di luar $transaction).
    await prisma.transaction.update({
      where: { id: paid.id },
      data: { status: TransactionStatus.PROCESSING },
    });

    try {
      const res = await digiflazzService.payPostpaid({
        refId: paid.orderId,
        sku: paid.productSku,
        customerNo: paid.customerNo,
        cbUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/digiflazz`,
      });

      await gatewayLogService.write(prisma, {
        transactionId: paid.id,
        provider: "DIGIFLAZZ",
        direction: "RESPONSE",
        endpoint: "/transaction (pay-pasca)",
        httpStatus: 200,
        payload: res,
      });

      return await this.applyDigiflazzResult(paid.id, res);
    } catch (err) {
      logger.error("tx.payPostpaid.fail", { id: paid.id, err: String(err) });
      await this.failAndRefund(paid.id, "Gagal menghubungi provider.");
      throw err;
    }
  },

  /**
   * Reconcile status dari Digiflazz — dipakai saat webhook telat / tidak masuk.
   *
   * - Hanya jalan untuk status non-final (PAID/PROCESSING).
   * - Untuk menghindari spam ke Digiflazz, debounce minStaleMs (default 8 detik):
   *   skip jika `updatedAt` masih segar.
   * - `force=true` mengabaikan debounce.
   *
   * Return transaksi terbaru (mungkin belum berubah jika provider belum update).
   */
  async reconcileWithProvider(
    orderId: string,
    opts: { force?: boolean; minStaleMs?: number } = {},
  ) {
    const { force = false, minStaleMs = 8_000 } = opts;
    const tx = await prisma.transaction.findUnique({ where: { orderId } });
    if (!tx) throw Errors.notFound("Transaksi");

    const RECONCILABLE: TransactionStatus[] = [
      TransactionStatus.PAID,
      TransactionStatus.PROCESSING,
    ];
    if (!RECONCILABLE.includes(tx.status)) return tx;

    if (!force) {
      const ageMs = Date.now() - tx.updatedAt.getTime();
      if (ageMs < minStaleMs) return tx;
    }

    try {
      const res = await digiflazzService.checkStatus(tx.orderId);
      await gatewayLogService.write(prisma, {
        transactionId: tx.id,
        provider: "DIGIFLAZZ",
        direction: "RESPONSE",
        endpoint: "/transaction (status-check)",
        httpStatus: 200,
        payload: res,
      });
      return await this.applyDigiflazzResult(tx.id, res);
    } catch (err) {
      logger.warn("tx.reconcile.fail", { id: tx.id, err: String(err) });
      // Bump updatedAt biar tidak retry brutal — tapi pertahankan status.
      return prisma.transaction.update({
        where: { id: tx.id },
        data: { updatedAt: new Date() },
      });
    }
  },
};
