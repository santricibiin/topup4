"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Image as ImageIcon, Zap, Type, RotateCcw, Palette, Upload, Trash2, Wallpaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { THEME_PRESETS, resolveTheme } from "@/lib/theme-presets";
import { BACKGROUND_PRESETS } from "@/lib/background-presets";
import { cn } from "@/lib/utils";

interface Props {
  initial: {
    name: string;
    tagline: string;
    logoUrl: string;
    theme: string;
    background: string;
  };
}

/**
 * Style preview mini untuk tiap pola background. Memakai hsl(var(--primary))
 * sehingga preview otomatis ikut warna tema yang sedang aktif.
 */
const BATIK_MASK =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='240'%20height='120'%20viewBox='0%200%20240%20120'%3E%3Cg%20fill='none'%20stroke='black'%20stroke-width='1.6'%20stroke-linecap='round'%3E%3Cpath%20d='M0%20120%20Q60%200%20120%20120%20Q180%200%20240%20120'/%3E%3Cpath%20d='M0%20120%20Q60%2024%20120%20120%20Q180%2024%20240%20120'/%3E%3Cpath%20d='M0%20120%20Q60%2048%20120%20120%20Q180%2048%20240%20120'/%3E%3Cpath%20d='M0%20120%20Q60%2072%20120%20120%20Q180%2072%20240%20120'/%3E%3Cpath%20d='M0%20120%20Q60%2096%20120%20120%20Q180%2096%20240%20120'/%3E%3C/g%3E%3C/svg%3E\")";

const PARANG_MASK =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='140'%20height='140'%20viewBox='0%200%20140%20140'%3E%3Cg%20fill='black'%3E%3Cpath%20d='M0%20140%20Q14%20112%2028%20112%20Q42%20112%2042%2098%20Q42%2084%2056%2084%20Q70%2084%2070%2070%20Q70%2056%2084%2056%20Q98%2056%2098%2042%20Q98%2028%20112%2028%20Q126%2028%20140%200%20L140%2014%20Q128%2030%20114%2030%20Q102%2030%20102%2042%20Q102%2058%2088%2058%20Q74%2058%2074%2070%20Q74%2086%2060%2086%20Q46%2086%2046%2098%20Q46%20114%2032%20114%20Q18%20114%206%20136%20Z'/%3E%3Cpath%20d='M70%2070%20l8%20-8%20l8%208%20l-8%208%20Z'%20transform='translate(-35%2035)'/%3E%3Cpath%20d='M70%2070%20l8%20-8%20l8%208%20l-8%208%20Z'%20transform='translate(35%20-35)'/%3E%3C/g%3E%3C/svg%3E\")";

const SOCIAL_MASK =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='120'%20height='120'%20viewBox='0%200%20120%20120'%3E%3Cg%20fill='black'%3E%3Cpath%20d='M30%2039%20C16%2030%2018%2021%2024%2021%20C27%2021%2029%2023%2030%2025%20C31%2023%2033%2021%2036%2021%20C42%2021%2044%2030%2030%2039%20Z'/%3E%3Cpath%20d='M84%2028%20L84%2042%20L96%2035%20Z'/%3E%3Cpath%20d='M24%2082%20h22%20a3%203%200%200%201%203%203%20v9%20a3%203%200%200%201%20-3%203%20h-12%20l-7%205%20v-5%20h-3%20a3%203%200%200%201%20-3%20-3%20v-9%20a3%203%200%200%201%203%20-3%20Z'/%3E%3Crect%20x='86'%20y='86'%20width='2.5'%20height='18'%20rx='1'/%3E%3Crect%20x='94'%20y='86'%20width='2.5'%20height='18'%20rx='1'/%3E%3Crect%20x='82'%20y='91'%20width='18'%20height='2.5'%20rx='1'/%3E%3Crect%20x='82'%20y='98'%20width='18'%20height='2.5'%20rx='1'/%3E%3C/g%3E%3C/svg%3E\")";

function previewStyle(key: string): React.CSSProperties {
  switch (key) {
    case "parang":
      return {
        backgroundColor: "hsl(var(--primary) / 0.55)",
        WebkitMaskImage: PARANG_MASK,
        maskImage: PARANG_MASK,
        WebkitMaskSize: "70px 70px",
        maskSize: "70px 70px",
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
      };
    case "social":
      return {
        backgroundColor: "hsl(var(--primary) / 0.55)",
        WebkitMaskImage: SOCIAL_MASK,
        maskImage: SOCIAL_MASK,
        WebkitMaskSize: "60px 60px",
        maskSize: "60px 60px",
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
      };
    case "batik":
      return {
        backgroundColor: "hsl(var(--primary) / 0.55)",
        WebkitMaskImage: BATIK_MASK,
        maskImage: BATIK_MASK,
        WebkitMaskSize: "80px 40px",
        maskSize: "80px 40px",
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
      };
    case "dots":
      return {
        backgroundImage:
          "radial-gradient(circle, hsl(var(--primary) / 0.5) 1.5px, transparent 1.6px)",
        backgroundSize: "12px 12px",
      };
    case "aurora":
      return {
        backgroundImage:
          "radial-gradient(40% 50% at 20% 20%, hsl(var(--primary) / 0.55) 0%, transparent 60%), radial-gradient(45% 50% at 80% 30%, hsl(var(--primary) / 0.4) 0%, transparent 55%), radial-gradient(55% 45% at 60% 90%, hsl(var(--primary) / 0.45) 0%, transparent 60%)",
      };
    case "diagonal":
      return {
        backgroundImage:
          "repeating-linear-gradient(45deg, hsl(var(--primary) / 0.4) 0, hsl(var(--primary) / 0.4) 1px, transparent 1px, transparent 8px)",
      };
    default:
      return {};
  }
}

export function SiteSettingsForm({ initial }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [tagline, setTagline] = useState(initial.tagline);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [theme, setTheme] = useState(initial.theme);
  const [background, setBackground] = useState(initial.background);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form text-fields dirty (logo di-upload langsung, jadi gak ikut dirty di sini)
  const dirty =
    name !== initial.name ||
    tagline !== initial.tagline ||
    theme !== initial.theme ||
    background !== initial.background;

  function handleReset() {
    setName(initial.name);
    setTagline(initial.tagline);
    setTheme(initial.theme);
    setBackground(initial.background);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tagline, logoUrl, theme, background }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal simpan");
      toast.success("Konfigurasi tersimpan, halaman akan refresh...");
      // Hard reload supaya theme + nama di layout root ikut update
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran file maks 2MB");
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/site/logo", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Upload gagal");
      setLogoUrl(json.data.logoUrl);
      toast.success("Logo berhasil di-upload, halaman akan refresh...");
      // Hard reload supaya layout (navbar + favicon di tab browser) ikut update
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!confirm("Hapus logo? Akan kembali ke icon default.")) return;
    setUploadingLogo(true);
    try {
      const res = await fetch("/api/admin/site/logo", { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal hapus");
      setLogoUrl("");
      toast.success("Logo dihapus, halaman akan refresh...");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  }

  const logoOk = logoUrl.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Live Preview */}
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-violet-500/5">
        <div className="border-b border-border/60 bg-card/80 px-5 py-2.5 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Pratinjau Navbar
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {logoOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="h-9 w-9 shrink-0 rounded-md object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm ring-1 ring-black/5">
                <Zap className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight">
                {name || "Nama Website"}
              </div>
              {tagline && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {tagline}
                </div>
              )}
            </div>
          </div>
          <span className="hidden rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 sm:inline">
            Live
          </span>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="site-name" className="flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5 text-muted-foreground" />
            Nama Website
          </Label>
          <Input
            id="site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="PTopup"
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            Tampil di navbar, judul tab browser, dan email notifikasi.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="site-tagline">Tagline</Label>
          <Input
            id="site-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Topup PPOB & Game — cepat, aman, anti-ribet."
            maxLength={160}
          />
          <p className="text-xs text-muted-foreground">
            Deskripsi singkat untuk SEO &amp; metadata sosial.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="site-logo" className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Logo Website
          </Label>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-card ring-1 ring-border">
              {logoOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-16 w-16 object-contain"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <input
                ref={fileInputRef}
                id="site-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {logoOk ? "Ganti Logo" : "Upload Logo"}
                </Button>
                {logoOk && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={handleLogoDelete}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG / JPG / WEBP / SVG / ICO &mdash; maks 2MB. Otomatis terapan ke navbar dan icon tab browser.
              </p>
            </div>
          </div>
        </div>

        {/* Theme picker */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            Warna Tema
          </Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {THEME_PRESETS.map((p) => {
              const active = theme === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTheme(p.key)}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
                  )}
                  title={p.label}
                >
                  <span
                    className="h-8 w-8 rounded-full ring-1 ring-black/5 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span className="line-clamp-1 text-[10px] font-medium">
                    {p.label.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Warna utama mempengaruhi tombol, link, badge, dan pattern batik di
            background. Saat ini:{" "}
            <span className="font-medium text-foreground">
              {resolveTheme(theme).label}
            </span>
          </p>
        </div>

        {/* Background picker */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Wallpaper className="h-3.5 w-3.5 text-muted-foreground" />
            Background Halaman
          </Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {BACKGROUND_PRESETS.map((b) => {
              const active = background === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBackground(b.key)}
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-lg border p-2 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
                  )}
                  title={b.description}
                >
                  <span className="relative block h-16 w-full overflow-hidden rounded-md bg-muted/40 ring-1 ring-border">
                    {b.key === "none" ? (
                      <span className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">
                        Polos
                      </span>
                    ) : (
                      <span
                        className="absolute inset-0"
                        style={previewStyle(b.key)}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="line-clamp-1 text-[11px] font-medium">
                    {b.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Pola dekoratif di belakang semua halaman. Warnanya otomatis
            mengikuti warna tema di atas.
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="text-xs text-muted-foreground">
          {dirty ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Ada perubahan belum disimpan
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Tersinkron
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan
          </Button>
        </div>
      </div>
    </form>
  );
}
