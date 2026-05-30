"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { BrandAvatar } from "./brand-avatar";
import { getBrandImage } from "../data/brand-images";

interface Props {
  brand: string;
  slug: string;
  /** "card" untuk grid katalog, "banner" untuk header detail page. */
  variant?: "card" | "banner";
  className?: string;
  /** Hanya berlaku utk variant="card". Default 64. */
  size?: number;
  /** Logo URL hasil upload admin (mengalahkan default brand-images). */
  logoUrl?: string | null;
}

/**
 * Render gambar hero brand. Urutan prioritas:
 *   1. logoUrl prop (hasil upload admin di /admin/brands).
 *   2. BRAND_IMAGES bawaan (gambar brand populer yang di-bundle).
 *   3. BrandAvatar (gradient inisial).
 */
export function BrandHero({
  brand,
  slug,
  variant = "card",
  className,
  size = 64,
  logoUrl,
}: Props) {
  const [failed, setFailed] = useState(false);
  const fallbackImage = getBrandImage(slug);
  // Custom upload tidak butuh background gradient — biarkan netral.
  const useCustom = !!logoUrl && !failed;
  const useFallback = !useCustom && !!fallbackImage && !failed;

  if (variant === "card") {
    if (!useCustom && !useFallback) {
      return (
        <BrandAvatar
          brand={brand}
          size="lg"
          className={className}
          style={{ width: size, height: size }}
        />
      );
    }
    const innerSize = Math.round(size * 0.8);
    if (useCustom) {
      return (
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card shadow-sm",
            className,
          )}
          style={{ width: size, height: size }}
        >
          <Image
            src={logoUrl!}
            alt={brand}
            width={innerSize}
            height={innerSize}
            unoptimized
            onError={() => setFailed(true)}
            className="object-contain"
            style={{ width: innerSize, height: innerSize }}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br shadow-sm ring-1 ring-black/5",
          fallbackImage!.accent ?? "from-slate-700 to-slate-900",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={fallbackImage!.src}
          alt={brand}
          width={Math.round(size * 0.75)}
          height={Math.round(size * 0.75)}
          unoptimized
          onError={() => setFailed(true)}
          className="object-contain drop-shadow-md"
          style={{
            width: Math.round(size * 0.75),
            height: Math.round(size * 0.75),
          }}
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/20" />
      </div>
    );
  }

  // variant = banner
  if (!useCustom && !useFallback) {
    return (
      <div
        className={cn(
          "relative h-32 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 via-violet-600/30 to-fuchsia-600/30 ring-1 ring-border",
          className,
        )}
      >
        <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute inset-0 grid place-items-center">
          <BrandAvatar brand={brand} size="lg" className="h-20 w-20 text-lg" />
        </div>
      </div>
    );
  }

  if (useCustom) {
    return (
      <div
        className={cn(
          "relative h-40 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:h-48",
          className,
        )}
      >
        <div className="absolute inset-0 grid place-items-center">
          <Image
            src={logoUrl!}
            alt={brand}
            width={160}
            height={160}
            unoptimized
            onError={() => setFailed(true)}
            className="h-28 w-28 object-contain md:h-36 md:w-36"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-40 w-full overflow-hidden rounded-2xl bg-gradient-to-br shadow-md ring-1 ring-black/5 md:h-48",
        fallbackImage!.accent ?? "from-slate-700 to-slate-900",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 30%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 25%)",
        }}
        aria-hidden
      />
      <div className="absolute inset-y-0 right-4 grid place-items-center md:right-10">
        <Image
          src={fallbackImage!.src}
          alt={brand}
          width={140}
          height={140}
          unoptimized
          onError={() => setFailed(true)}
          className="h-24 w-24 object-contain drop-shadow-2xl md:h-32 md:w-32"
        />
      </div>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
    </div>
  );
}
