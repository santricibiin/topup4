/**
 * Media Storage — semua upload user-generated disimpan di luar `public/`
 * (di `data/uploads/<category>/<filename>`) dan dilayani via
 * API route `/api/media/<category>/<filename>`.
 *
 * Tujuan: update file langsung kelihatan tanpa restart / rebuild Next.js,
 * dan tidak butuh symlink saat deploy `output: standalone`.
 */
import path from "node:path";
import fs from "node:fs/promises";

export const MEDIA_ROOT = path.join(process.cwd(), "data", "uploads");
export const MEDIA_URL_PREFIX = "/api/media";
/** Path lama yang masih kompatibel (dilayani Next.js dari `public/`). */
export const LEGACY_URL_PREFIX = "/uploads";
const LEGACY_ROOT = path.join(process.cwd(), "public", "uploads");

export type MediaCategory = "avatars" | "logos" | "brands" | "tickets";

/** Pastikan folder kategori siap pakai. */
export async function ensureMediaDir(category: MediaCategory): Promise<string> {
  const dir = path.join(MEDIA_ROOT, category);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Buat URL publik untuk file media. Tambahkan ?v=<ts> kalau perlu cache-bust. */
export function buildMediaUrl(
  category: MediaCategory,
  filename: string,
  options: { cacheBust?: boolean | number } = {},
): string {
  let url = `${MEDIA_URL_PREFIX}/${category}/${encodeURIComponent(filename)}`;
  if (options.cacheBust) {
    const v =
      typeof options.cacheBust === "number" ? options.cacheBust : Date.now();
    url += `?v=${v}`;
  }
  return url;
}

/**
 * Resolusi path absolut + guard path-traversal.
 * Throw kalau hasil keluar dari MEDIA_ROOT.
 */
export function resolveMediaPath(
  category: MediaCategory,
  filename: string,
): string {
  const dir = path.join(MEDIA_ROOT, category);
  const full = path.resolve(dir, filename);
  if (!full.startsWith(path.resolve(dir) + path.sep) && full !== path.resolve(dir)) {
    throw new Error("Invalid media path");
  }
  return full;
}

/**
 * Hapus file media dari disk berdasarkan URL.
 * Mendukung dua format: `/api/media/<cat>/<file>` (baru) & `/uploads/<cat>/<file>` (lama).
 * Aman dipanggil meski file sudah hilang.
 */
export async function deleteMediaByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const clean = url.split("?")[0] ?? url;

  if (clean.startsWith(`${MEDIA_URL_PREFIX}/`)) {
    const rest = clean.slice(MEDIA_URL_PREFIX.length + 1); // <cat>/<file>
    const slash = rest.indexOf("/");
    if (slash <= 0) return;
    const category = rest.slice(0, slash) as MediaCategory;
    const filename = decodeURIComponent(rest.slice(slash + 1));
    try {
      const full = resolveMediaPath(category, filename);
      await fs.unlink(full).catch(() => {});
    } catch {
      // path traversal terdeteksi atau category invalid — abaikan.
    }
    return;
  }

  if (clean.startsWith(`${LEGACY_URL_PREFIX}/`)) {
    const rest = clean.slice(LEGACY_URL_PREFIX.length + 1);
    const full = path.resolve(LEGACY_ROOT, rest);
    if (full.startsWith(path.resolve(LEGACY_ROOT) + path.sep)) {
      await fs.unlink(full).catch(() => {});
    }
  }
}

/**
 * Ekstensi MIME utk Content-Type stream.
 */
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

export function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
