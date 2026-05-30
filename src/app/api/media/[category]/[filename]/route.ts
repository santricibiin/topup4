/**
 * GET /api/media/[category]/[filename]
 *
 * Stream file dari `data/uploads/<category>/<filename>`. Public read karena
 * dipakai utk avatar, logo brand, & logo website yg memang publik.
 *
 * Untuk file privat (lampiran tiket), pakai endpoint khusus
 * `/api/tickets/[id]/attachments/[attId]` yang mengecek otorisasi.
 */
import { NextRequest, NextResponse } from "next/server";
import { stat, readFile } from "node:fs/promises";
import {
  mimeFromFilename,
  resolveMediaPath,
  type MediaCategory,
} from "@/lib/media-storage";

export const dynamic = "force-dynamic";

const PUBLIC_CATEGORIES = new Set<MediaCategory>(["avatars", "logos", "brands"]);

export async function GET(
  _req: NextRequest,
  ctx: { params: { category: string; filename: string } },
) {
  const { category, filename } = ctx.params;
  if (!PUBLIC_CATEGORIES.has(category as MediaCategory)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let full: string;
  try {
    full = resolveMediaPath(category as MediaCategory, filename);
  } catch {
    return new NextResponse("Invalid path", { status: 400 });
  }

  let info;
  try {
    info = await stat(full);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!info.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readFile(full);
  const contentType = mimeFromFilename(filename);

  // Cache moderat: 5 menit di browser, 1 jam di shared cache, dengan
  // stale-while-revalidate supaya update logo cepat propagasi.
  // Kombinasi `?v=<ts>` di URL dari kode pemakai untuk cache-bust hard.
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Last-Modified": info.mtime.toUTCString(),
    },
  });
}
