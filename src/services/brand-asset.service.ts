/**
 * Brand Asset Service — kelola logo & metadata per brand.
 *
 * Brand list adalah turunan dari Product.brand DISTINCT.
 * Tabel BrandAsset hanya menyimpan override (logo upload, sort, visibility).
 *
 * File logo disimpan di `data/uploads/brands/<slug>.webp` dan dilayani via
 * `/api/media/brands/<slug>.webp` (di luar `public/`, tidak butuh restart).
 */
import path from "node:path";
import sharp from "sharp";
import type { ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  buildMediaUrl,
  deleteMediaByUrl,
  ensureMediaDir,
} from "@/lib/media-storage";

export interface BrandSummary {
  brand: string;
  slug: string;
  category: ProductCategory;
  productCount: number;
  logoUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
}

const TARGET_SIZE = 256; // px
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB sebelum resize
const ALLOWED_INPUT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

class BrandAssetService {
  /**
   * Daftar semua brand (digabung dari Product) + asset override-nya.
   * Dipakai admin untuk grid kelola logo per kategori.
   */
  async listAllForAdmin(): Promise<BrandSummary[]> {
    const [productRows, assets] = await Promise.all([
      prisma.product.groupBy({
        by: ["brand", "category"],
        where: { status: { not: "INACTIVE" } },
        _count: { _all: true },
      }),
      prisma.brandAsset.findMany(),
    ]);

    const assetByBrand = new Map(assets.map((a) => [a.brand, a]));

    return productRows
      .map((row) => {
        const a = assetByBrand.get(row.brand);
        return {
          brand: row.brand,
          slug: a?.slug ?? slugify(row.brand),
          category: row.category,
          productCount: row._count._all,
          logoUrl: a?.logoUrl ?? null,
          sortOrder: a?.sortOrder ?? 0,
          isVisible: a?.isVisible ?? true,
        };
      })
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.brand.localeCompare(b.brand);
      });
  }

  /** Map slug → logoUrl, untuk dipakai halaman publik (TopupSearch, brand page). */
  async getLogoMap(): Promise<Map<string, string>> {
    const rows = await prisma.brandAsset.findMany({
      where: { logoUrl: { not: null }, isVisible: true },
      select: { slug: true, logoUrl: true },
    });
    const out = new Map<string, string>();
    for (const r of rows) {
      if (r.logoUrl) out.set(r.slug, r.logoUrl);
    }
    return out;
  }

  /** Daftar slug yang di-hide oleh admin (isVisible=false). */
  async listHiddenSlugs(): Promise<string[]> {
    const rows = await prisma.brandAsset.findMany({
      where: { isVisible: false },
      select: { slug: true },
    });
    return rows.map((r) => r.slug);
  }

  /** Cari asset by slug. */
  async findBySlug(slug: string) {
    return prisma.brandAsset.findUnique({ where: { slug } });
  }

  /** Cari asset by canonical brand. */
  async findByBrand(brand: string) {
    return prisma.brandAsset.findUnique({ where: { brand } });
  }

  /**
   * Upload logo baru (atau ganti). File di-resize ke 256x256 webp transparent.
   * Mengembalikan URL publik.
   */
  async uploadLogo(params: {
    brand: string;
    file: { buffer: Buffer; mimeType: string; size: number };
  }): Promise<string> {
    const { brand, file } = params;
    if (!ALLOWED_INPUT_TYPES.has(file.mimeType)) {
      throw new Error(
        `Tipe file tidak didukung (${file.mimeType}). Gunakan PNG/JPG/WEBP/GIF.`,
      );
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new Error("Ukuran file terlalu besar. Maks 5 MB.");
    }

    const slug = slugify(brand);
    if (!slug) throw new Error("Nama brand tidak valid.");

    const dir = await ensureMediaDir("brands");
    const fileName = `${slug}.webp`;
    const fullPath = path.join(dir, fileName);

    try {
      await sharp(file.buffer)
        .resize(TARGET_SIZE, TARGET_SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 85 })
        .toFile(fullPath);
    } catch (err) {
      logger.error("brand.uploadLogo.sharp.fail", { brand, err: String(err) });
      throw new Error("Gambar tidak dapat diproses. Pastikan file valid.");
    }

    // Cache-buster sederhana via mtime, biar browser auto-refresh setelah upload ulang.
    const url = buildMediaUrl("brands", fileName, { cacheBust: true });

    await prisma.brandAsset.upsert({
      where: { brand },
      create: { brand, slug, logoUrl: url },
      update: { slug, logoUrl: url },
    });

    return url;
  }

  /** Hapus logo (file + kosongkan kolom). Tidak menghapus row asset. */
  async deleteLogo(brand: string): Promise<void> {
    const asset = await prisma.brandAsset.findUnique({ where: { brand } });
    if (!asset) return;

    if (asset.logoUrl) {
      // Mendukung URL legacy (/uploads/brands/*) maupun baru (/api/media/brands/*).
      await deleteMediaByUrl(asset.logoUrl);
    }

    await prisma.brandAsset.update({
      where: { brand },
      data: { logoUrl: null },
    });
  }

  /** Update metadata (visibility, sort, kategori pin). */
  async updateMeta(
    brand: string,
    data: {
      isVisible?: boolean;
      sortOrder?: number;
      category?: ProductCategory | null;
    },
  ): Promise<void> {
    const slug = slugify(brand);
    await prisma.brandAsset.upsert({
      where: { brand },
      create: {
        brand,
        slug,
        isVisible: data.isVisible ?? true,
        sortOrder: data.sortOrder ?? 0,
        category: data.category ?? null,
      },
      update: {
        ...(data.isVisible !== undefined && { isVisible: data.isVisible }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.category !== undefined && { category: data.category }),
      },
    });
  }
}

export const brandAssetService = new BrandAssetService();
