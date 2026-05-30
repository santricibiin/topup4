import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ProductCategory } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { brandAssetService } from "@/services/brand-asset.service";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_CATEGORY = new Set(Object.keys(ProductCategory));

const UpdateSchema = z.object({
  brand: z.string().min(1).max(120),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  category: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => v == null || VALID_CATEGORY.has(v),
      "Kategori tidak valid",
    ),
});

const DeleteSchema = z.object({
  brand: z.string().min(1).max(120),
});

/** GET /api/admin/brands → list semua brand + asset. */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const items = await brandAssetService.listAllForAdmin();
  return ok({ items });
});

/**
 * POST /api/admin/brands → upload logo (multipart/form-data).
 * Form fields: brand (string), file (File).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const admin = await requireAdminApi(req);

  const form = await req.formData().catch(() => null);
  if (!form) throw Errors.badRequest("Body harus multipart/form-data.");

  const brand = String(form.get("brand") ?? "").trim();
  const file = form.get("file");
  if (!brand) throw Errors.badRequest("Nama brand wajib diisi.");
  if (!(file instanceof File)) throw Errors.badRequest("File logo wajib dilampirkan.");

  const buffer = Buffer.from(await file.arrayBuffer());

  let logoUrl: string;
  try {
    logoUrl = await brandAssetService.uploadLogo({
      brand,
      file: { buffer, mimeType: file.type, size: file.size },
    });
  } catch (err) {
    throw Errors.badRequest((err as Error).message);
  }

  logger.info("admin.brand.upload", { by: admin.id, brand });

  // Revalidate halaman publik supaya logo langsung muncul.
  revalidatePath("/topup");
  revalidatePath("/admin/brands");

  return ok({ brand, logoUrl });
});

/** PATCH /api/admin/brands → update metadata (visibility, sort, kategori pin). */
export const PATCH = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const body = await req.json().catch(() => ({}));
  const data = UpdateSchema.parse(body);

  await brandAssetService.updateMeta(data.brand, {
    isVisible: data.isVisible,
    sortOrder: data.sortOrder,
    category: (data.category ?? null) as ProductCategory | null,
  });

  revalidatePath("/topup");
  return ok({ updated: true });
});

/** DELETE /api/admin/brands → hapus logo (file + kosongkan url). */
export const DELETE = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const body = await req.json().catch(() => ({}));
  const { brand } = DeleteSchema.parse(body);

  await brandAssetService.deleteLogo(brand);

  revalidatePath("/topup");
  return ok({ deleted: true });
});
