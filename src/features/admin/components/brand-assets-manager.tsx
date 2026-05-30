"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface BrandRow {
  brand: string;
  slug: string;
  category: string;
  productCount: number;
  logoUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
}

interface Props {
  initialItems: BrandRow[];
  categoryLabels: Record<string, string>;
}

export function BrandAssetsManager({ initialItems, categoryLabels }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<BrandRow[]>(initialItems);
  const [q, setQ] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(() => {
    // Default: buka kategori pertama saja, sisanya collapse.
    const cats = Array.from(new Set(initialItems.map((i) => i.category)));
    return new Set(cats.slice(0, 1));
  });

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? items.filter((i) => i.brand.toLowerCase().includes(needle))
      : items;
    const map = new Map<string, BrandRow[]>();
    for (const it of filtered) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      (categoryLabels[a] ?? a).localeCompare(categoryLabels[b] ?? b),
    );
  }, [items, q, categoryLabels]);

  function toggleCat(cat: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function expandAll() {
    setOpenCats(new Set(grouped.map(([c]) => c)));
  }
  function collapseAll() {
    setOpenCats(new Set());
  }

  /** Apply update lokal ke 1 brand (optimistic). */
  function patchLocal(brand: string, patch: Partial<BrandRow>) {
    setItems((prev) =>
      prev.map((it) => (it.brand === brand ? { ...it, ...patch } : it)),
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari brand…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}>
          Buka Semua
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Tutup Semua
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.refresh()}
          title="Muat ulang dari database"
        >
          Refresh
        </Button>
      </div>

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Tidak ada brand. Sync produk dulu dari halaman Produk.
        </div>
      )}

      {/* Accordion per kategori */}
      <div className="space-y-3">
        {grouped.map(([cat, rows]) => {
          const isOpen = openCats.has(cat);
          const label = categoryLabels[cat] ?? cat;
          const visibleCount = rows.filter((r) => r.isVisible).length;
          const withLogo = rows.filter((r) => r.logoUrl).length;
          return (
            <div
              key={cat}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                  <div>
                    <div className="text-sm font-semibold tracking-tight">
                      {label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {rows.length} brand · {withLogo} berlogo · {visibleCount}{" "}
                      visible
                    </div>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="grid gap-2 border-t border-border/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((row) => (
                    <BrandRowCard
                      key={row.brand}
                      row={row}
                      onPatch={(p) => patchLocal(row.brand, p)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RowProps {
  row: BrandRow;
  onPatch: (p: Partial<BrandRow>) => void;
}

function BrandRowCard({ row, onPatch }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const [sortDraft, setSortDraft] = useState(String(row.sortOrder));

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("brand", row.brand);
      fd.append("file", file);
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Upload gagal");
      onPatch({ logoUrl: json.data.logoUrl });
      toast.success(`Logo ${row.brand} di-upload.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!row.logoUrl) return;
    if (!confirm(`Hapus logo ${row.brand}?`)) return;
    try {
      const res = await fetch("/api/admin/brands", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: row.brand }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Hapus gagal");
      onPatch({ logoUrl: null });
      toast.success("Logo dihapus.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function patchMeta(data: { isVisible?: boolean; sortOrder?: number }) {
    try {
      const res = await fetch("/api/admin/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: row.brand, ...data }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Update gagal");
      onPatch(data);
      startTransition(() => {});
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/70 bg-background p-3 transition-colors",
        !row.isVisible && "opacity-60",
      )}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
        {row.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.logoUrl}
            alt={row.brand}
            className="h-full w-full object-contain"
          />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={row.brand}>
          {row.brand}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {row.productCount} produk
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="number"
            value={sortDraft}
            onChange={(e) => setSortDraft(e.target.value)}
            onBlur={() => {
              const n = Math.max(0, Math.min(9999, Number(sortDraft) || 0));
              if (n !== row.sortOrder) patchMeta({ sortOrder: n });
              setSortDraft(String(n));
            }}
            className="h-7 w-14 rounded-md border border-input bg-background px-2 text-xs"
            title="Urutan tampil (kecil = duluan)"
            min={0}
            max={9999}
          />
          <span className="text-[10px] text-muted-foreground">urut</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={row.logoUrl ? "Ganti logo" : "Upload logo"}
            className="h-8 px-2"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
          </Button>
          {row.logoUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDelete}
              title="Hapus logo"
              className="h-8 px-2 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => patchMeta({ isVisible: !row.isVisible })}
            title={row.isVisible ? "Sembunyikan" : "Tampilkan"}
            className="h-8 px-2"
          >
            {row.isVisible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
