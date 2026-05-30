import { ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { brandAssetService } from "@/services/brand-asset.service";
import { categorySettingsService } from "@/services/category-settings.service";
import { BrandAssetsManager } from "@/features/admin/components/brand-assets-manager";

export const metadata = { title: "Admin · Brand" };
export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const [items, categories] = await Promise.all([
    brandAssetService.listAllForAdmin(),
    categorySettingsService.getAll(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <ImageIcon className="h-6 w-6 text-primary md:h-7 md:w-7" />
          Brand
        </h1>
        <p className="text-sm text-muted-foreground">
          Atur logo, urutan, dan visibility per brand. Logo otomatis di-resize ke
          256&times;256 (WEBP) — tidak perlu pikirkan ukuran file.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 md:p-6">
          <BrandAssetsManager
            initialItems={items.map((it) => ({
              brand: it.brand,
              slug: it.slug,
              category: String(it.category),
              productCount: it.productCount,
              logoUrl: it.logoUrl,
              sortOrder: it.sortOrder,
              isVisible: it.isVisible,
            }))}
            categoryLabels={Object.fromEntries(
              categories.map((c) => [c.category, c.label]),
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
