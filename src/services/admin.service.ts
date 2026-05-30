/**
 * Admin Service — operasi admin (sync produk, monitoring, dsb).
 *
 * Margin default: 5% dibulatkan ke 100 ke atas, minimum +500.
 * Override: env DIGIFLAZZ_MARGIN_PERCENT, DIGIFLAZZ_MARGIN_MIN.
 */
import { Prisma, type ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { digiflazzService } from "./digiflazz.service";
import { settingsService, applyMarkup } from "./settings.service";
import type { DigiflazzPascaProduct, DigiflazzProduct } from "@/types/digiflazz";

// Kategori Digiflazz datang sebagai string bebas — mapping ke enum kita.
// Kategori utama Digiflazz (per dokumentasi & pricelist publik):
//   Pulsa, Data, PLN, Games, E-Money, Voucher, Pascabayar, TV,
//   Aktivasi Voucher, Paket SMS & Telpon, Masa Aktif, Saldo OVO,
//   Saldo DANA, Saldo Gopay, Saldo ShopeePay, Streaming.
// Untuk safety, lookup pakai normalized key (lowercase, alphanumeric only).
const CATEGORY_MAP: Record<string, ProductCategory> = {
  pulsa: "PULSA",
  pulsareguler: "PULSA",
  pulsatransfer: "PULSA",

  data: "DATA",
  paketdata: "DATA",
  internet: "DATA",

  pln: "PLN",
  plnprabayar: "PLN",
  plnpascabayar: "PASCABAYAR",
  tokenpln: "PLN",

  game: "GAME",
  games: "GAME",
  voucherandgames: "GAME",
  vouchergame: "GAME",

  emoney: "EWALLET",
  ewallet: "EWALLET",
  saldoovo: "EWALLET",
  saldodana: "EWALLET",
  saldogopay: "EWALLET",
  saldoshopeepay: "EWALLET",
  saldolinkaja: "EWALLET",

  voucher: "VOUCHER",
  voucherbelanja: "VOUCHER",

  pascabayar: "PASCABAYAR",
  pasca: "PASCABAYAR",
  pascabayarpln: "PASCABAYAR",

  streaming: "STREAMING",
  tvstreaming: "STREAMING",

  aktivasivoucher: "AKTIVASI_VOUCHER",
  aktivasivoucherreguler: "AKTIVASI_VOUCHER",

  paketsmstelpon: "PAKET_SMS_TELPON",
  paketsmsdantelpon: "PAKET_SMS_TELPON",
  smsdantelpon: "PAKET_SMS_TELPON",
  smstelpon: "PAKET_SMS_TELPON",

  masaaktif: "MASA_AKTIF",
  masaaktifreguler: "MASA_AKTIF",

  tv: "TV_KABEL",
  tvkabel: "TV_KABEL",
  tvprabayar: "TV_KABEL",

  gas: "GAS",
  pgn: "GAS",

  bpjs: "BPJS",
  bpjskesehatan: "BPJS",
  bpjsketenagakerjaan: "BPJS",

  asuransi: "ASURANSI",

  pdam: "PDAM",
  pam: "PDAM",
  airpam: "PDAM",

  transportasi: "TRANSPORTASI",
  etoll: "TRANSPORTASI",
  emoneymandiri: "TRANSPORTASI",
  flazzbca: "TRANSPORTASI",

  sembako: "SEMBAKO",
  pulsasembako: "SEMBAKO",
};

function mapCategory(raw: string): ProductCategory {
  // Normalize: lowercase + buang semua spasi/special char (e.g. "Aktivasi Voucher" → "aktivasivoucher").
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return CATEGORY_MAP[key] ?? "OTHER";
}

function pickStatus(p: DigiflazzProduct): "ACTIVE" | "INACTIVE" | "GANGGUAN" {
  if (!p.buyer_product_status || !p.seller_product_status) return "INACTIVE";
  if (!p.unlimited_stock && p.stock <= 0) return "GANGGUAN";
  return "ACTIVE";
}

function pickPascaStatus(p: DigiflazzPascaProduct): "ACTIVE" | "INACTIVE" {
  return p.buyer_product_status && p.seller_product_status ? "ACTIVE" : "INACTIVE";
}

class AdminService {
  /**
   * Sync seluruh produk Digiflazz ke tabel Product.
   * Idempotent: aman dijalankan berulang.
   * Markup diambil dari Setting saat eksekusi.
   */
  async syncDigiflazzProducts() {
    const [remote, remotePasca, markupCfg] = await Promise.all([
      digiflazzService.getPriceList(),
      digiflazzService.getPriceListPasca(),
      settingsService.getMarkupConfig(),
    ]);
    logger.info("admin.sync.fetched", {
      prepaid: remote.length,
      pasca: remotePasca.length,
      markupCfg,
    });

    let created = 0;
    let updated = 0;
    let failed = 0;

    // Batch transaction agar partial failure tidak meninggalkan state korup.
    // Gunakan upsert per SKU; pakai chunk supaya tidak timeout.
    const CHUNK = 50;
    for (let i = 0; i < remote.length; i += CHUNK) {
      const chunk = remote.slice(i, i + CHUNK);
      try {
        await prisma.$transaction(
          chunk.map((p) => {
            const sellPrice = applyMarkup(p.price, markupCfg);
            const status = pickStatus(p);
            return prisma.product.upsert({
              where: { sku: p.buyer_sku_code },
              create: {
                sku: p.buyer_sku_code,
                name: p.product_name,
                brand: p.brand,
                category: mapCategory(p.category),
                type: p.type,
                description: p.desc || null,
                basePrice: new Prisma.Decimal(p.price),
                sellPrice: new Prisma.Decimal(sellPrice),
                status,
                multi: p.multi,
                stock: p.unlimited_stock ? null : p.stock,
                cutoffStart: p.start_cut_off || null,
                cutoffEnd: p.end_cut_off || null,
                providerMeta: p as unknown as Prisma.InputJsonValue,
              },
              update: {
                name: p.product_name,
                brand: p.brand,
                category: mapCategory(p.category),
                type: p.type,
                description: p.desc || null,
                basePrice: new Prisma.Decimal(p.price),
                sellPrice: new Prisma.Decimal(sellPrice),
                status,
                multi: p.multi,
                stock: p.unlimited_stock ? null : p.stock,
                cutoffStart: p.start_cut_off || null,
                cutoffEnd: p.end_cut_off || null,
                providerMeta: p as unknown as Prisma.InputJsonValue,
              },
            });
          }),
        );
      } catch (err) {
        failed += chunk.length;
        logger.error("admin.sync.chunk.fail", { chunkStart: i, err: String(err) });
      }
    }

    // ---- Sync produk pascabayar (tagihan) ----
    // Pricelist pasca tidak punya harga jual (harga riil dari inquiry runtime).
    // basePrice = admin fee, sellPrice = applyMarkup(admin) → selisih jadi margin
    // yang ditambahkan ke nilai tagihan saat transaksi.
    for (let i = 0; i < remotePasca.length; i += CHUNK) {
      const chunk = remotePasca.slice(i, i + CHUNK);
      try {
        await prisma.$transaction(
          chunk.map((p) => {
            const sellPrice = applyMarkup(p.admin, markupCfg);
            const status = pickPascaStatus(p);
            return prisma.product.upsert({
              where: { sku: p.buyer_sku_code },
              create: {
                sku: p.buyer_sku_code,
                name: p.product_name,
                brand: p.brand,
                category: mapCategory(p.category),
                type: p.brand,
                description: p.desc || null,
                basePrice: new Prisma.Decimal(p.admin),
                sellPrice: new Prisma.Decimal(sellPrice),
                status,
                isPostpaid: true,
                multi: false,
                stock: null,
                providerMeta: p as unknown as Prisma.InputJsonValue,
              },
              update: {
                name: p.product_name,
                brand: p.brand,
                category: mapCategory(p.category),
                type: p.brand,
                description: p.desc || null,
                basePrice: new Prisma.Decimal(p.admin),
                sellPrice: new Prisma.Decimal(sellPrice),
                status,
                isPostpaid: true,
                providerMeta: p as unknown as Prisma.InputJsonValue,
              },
            });
          }),
        );
      } catch (err) {
        failed += chunk.length;
        logger.error("admin.sync.pasca.chunk.fail", { chunkStart: i, err: String(err) });
      }
    }

    // Hitung created vs updated berdasarkan timestamp.
    const after = await prisma.product.findMany({
      select: { createdAt: true, updatedAt: true },
    });
    created = after.filter(
      (p) => p.createdAt.getTime() === p.updatedAt.getTime(),
    ).length;
    updated = after.length - created;

    return {
      total: remote.length + remotePasca.length,
      prepaid: remote.length,
      pasca: remotePasca.length,
      created,
      updated,
      failed,
    };
  }

  /** Statistik dashboard admin. */
  async getDashboardStats() {
    const [
      totalUsers,
      totalProducts,
      totalTransactions,
      revenueAgg,
      profitAgg,
      pendingCount,
      successToday,
      failedToday,
      profitTodayAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.transaction.count(),
      // Revenue = total yg dibayar user (sellPrice + adminFee)
      prisma.transaction.aggregate({
        where: { status: "SUCCESS" },
        _sum: { totalAmount: true },
      }),
      // Profit = (sellPrice - basePrice) untuk semua tx SUCCESS
      // Pakai 2 sum lalu kurangi di JS karena Prisma gak support arithmetic agg.
      prisma.transaction.aggregate({
        where: { status: "SUCCESS" },
        _sum: { sellPrice: true, basePrice: true },
      }),
      prisma.transaction.count({
        where: { status: { in: ["PENDING", "PAID", "PROCESSING"] } },
      }),
      prisma.transaction.count({
        where: {
          status: "SUCCESS",
          createdAt: { gte: startOfToday() },
        },
      }),
      prisma.transaction.count({
        where: {
          status: "FAILED",
          createdAt: { gte: startOfToday() },
        },
      }),
      prisma.transaction.aggregate({
        where: {
          status: "SUCCESS",
          createdAt: { gte: startOfToday() },
        },
        _sum: { sellPrice: true, basePrice: true },
      }),
    ]);

    const totalProfit =
      Number(profitAgg._sum.sellPrice ?? 0) -
      Number(profitAgg._sum.basePrice ?? 0);
    const profitToday =
      Number(profitTodayAgg._sum.sellPrice ?? 0) -
      Number(profitTodayAgg._sum.basePrice ?? 0);

    return {
      totalUsers,
      totalProducts,
      totalTransactions,
      totalRevenue: revenueAgg._sum.totalAmount?.toString() ?? "0",
      totalProfit: totalProfit.toString(),
      profitToday: profitToday.toString(),
      pendingCount,
      successToday,
      failedToday,
    };
  }

  /**
   * Sales time series untuk chart 14 hari terakhir.
   * Return array daily { date, revenue, count } urut dari paling lama → terbaru.
   */
  async getSalesChart(days = 14) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const rows = await prisma.transaction.findMany({
      where: {
        status: "SUCCESS",
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, totalAmount: true },
    });

    // Bucket per tanggal (YYYY-MM-DD).
    const buckets = new Map<string, { revenue: number; count: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      buckets.set(toKey(d), { revenue: 0, count: 0 });
    }
    for (const r of rows) {
      const k = toKey(r.createdAt);
      const b = buckets.get(k);
      if (!b) continue;
      b.revenue += Number(r.totalAmount);
      b.count += 1;
    }

    return [...buckets.entries()].map(([date, v]) => ({
      date,
      revenue: v.revenue,
      count: v.count,
    }));
  }

  /** Breakdown revenue per kategori produk (semua waktu, status=SUCCESS). */
  async getCategoryBreakdown() {
    const rows = await prisma.transaction.findMany({
      where: { status: "SUCCESS" },
      select: {
        totalAmount: true,
        product: { select: { category: true } },
      },
    });

    const map = new Map<string, { revenue: number; count: number }>();
    for (const r of rows) {
      const key = String(r.product?.category ?? "OTHER");
      const cur = map.get(key) ?? { revenue: 0, count: 0 };
      cur.revenue += Number(r.totalAmount);
      cur.count += 1;
      map.set(key, cur);
    }

    return [...map.entries()]
      .map(([category, v]) => ({
        category,
        revenue: v.revenue,
        count: v.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export const adminService = new AdminService();
