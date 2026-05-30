import { notFound } from "next/navigation";
import { ProductCategory, type Product } from "@prisma/client";
import { Navbar } from "@/components/layout/navbar";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { settingsService, SETTING_KEYS } from "@/services/settings.service";
import { brandAssetService } from "@/services/brand-asset.service";
import { TopupFlow } from "@/features/topup/components/topup-flow";
import { PostpaidFlow } from "@/features/topup/components/postpaid-flow";
import { BrandHero } from "@/features/topup/components/brand-hero";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { brand: string };
  searchParams: { category?: string };
}

const CATEGORY_LABEL: Record<string, string> = {
  PULSA: "Pulsa",
  DATA: "Paket Data",
  PLN: "Token PLN",
  EWALLET: "E-Wallet",
  GAME: "Game",
  VOUCHER: "Voucher",
  STREAMING: "Streaming",
  PASCABAYAR: "Pascabayar",
  AKTIVASI_VOUCHER: "Aktivasi Voucher",
  PAKET_SMS_TELPON: "Paket SMS & Telpon",
  MASA_AKTIF: "Masa Aktif",
  TV_KABEL: "TV Kabel",
  GAS: "Gas",
  BPJS: "BPJS",
  ASURANSI: "Asuransi",
  PDAM: "PDAM",
  TRANSPORTASI: "Transportasi",
  SEMBAKO: "Sembako",
  OTHER: "Lainnya",
};

function isValidCategory(cat: string): cat is ProductCategory {
  return cat in ProductCategory;
}

/**
 * Resolve brand: query distinct brand list (kecil) + match slug.
 * Cuma SELECT brand, gak fetch full row → cepat.
 */
async function resolveBrand(slug: string): Promise<string | null> {
  const target = slug.toLowerCase();
  const brands = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { brand: true },
    distinct: ["brand"],
  });
  return brands.find((b) => slugify(b.brand) === target)?.brand ?? null;
}

export async function generateMetadata({ params }: PageProps) {
  // Skip resolve di metadata utk hindari double query — cukup pakai slug.
  const slug = decodeURIComponent(params.brand);
  const display = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return { title: `Topup ${display}` };
}

export default async function TopupBrandPage({ params, searchParams }: PageProps) {
  const slug = decodeURIComponent(params.brand);
  const categoryParam = searchParams.category?.toUpperCase();
  const category =
    categoryParam && isValidCategory(categoryParam) ? categoryParam : undefined;

  // Resolve brand + fetch products + iconSize PARALEL.
  const [brand, iconSizeRaw, branding] = await Promise.all([
    resolveBrand(slug),
    settingsService.get(SETTING_KEYS.TOPUP_ICON_SIZE),
    settingsService.getSiteBranding(),
  ]);

  if (!brand) notFound();

  // Sekarang fetch products + brand asset (untuk logo) parallel.
  // Pakai SELECT eksplisit utk skip kolom heavy (providerMeta = JSON besar).
  const [products, asset] = await Promise.all([
    prisma.product.findMany({
      where: {
        brand,
        status: "ACTIVE",
        ...(category && { category }),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        sellPrice: true,
        description: true,
        category: true,
        isPostpaid: true,
      },
      orderBy: [{ category: "asc" }, { sellPrice: "asc" }],
    }),
    brandAssetService.findByBrand(brand),
  ]);

  if (products.length === 0) notFound();

  const iconSize = Math.max(24, Math.min(96, Number(iconSizeRaw) || 56));
  const finalCategory = category ?? String(products[0]!.category);
  const isPostpaid = products.every((p) => p.isPostpaid);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="container py-6 md:py-8">
          <div className="mb-8 flex items-center gap-4">
            <BrandHero
              brand={brand}
              slug={slug}
              variant="card"
              size={72}
              logoUrl={asset?.logoUrl ?? null}
              className="md:!h-20 md:!w-20"
            />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[finalCategory] ?? finalCategory}
              </p>
              <h1 className="mt-1 truncate font-display text-3xl font-semibold tracking-tight md:text-4xl">
                {brand}
              </h1>
            </div>
          </div>

          {isPostpaid ? (
            <PostpaidFlow
              brand={brand}
              category={finalCategory}
              siteName={branding.name}
              products={products.map((p) => ({
                id: p.id,
                sku: p.sku,
                name: p.name,
                type: p.type,
                sellPrice: p.sellPrice.toString(),
                description: p.description,
              }))}
            />
          ) : (
            <TopupFlow
              brand={brand}
              category={finalCategory}
              iconSize={iconSize}
              siteName={branding.name}
              products={products.map((p) => ({
                id: p.id,
                sku: p.sku,
                name: p.name,
                type: p.type,
                sellPrice: p.sellPrice.toString(),
                description: p.description,
              }))}
            />
          )}
        </div>
      </main>
    </>
  );
}
