/**
 * GET  /api/admin/backup            → list backup files + meta (last run, next run, dir)
 * POST /api/admin/backup            → trigger manual backup
 *                                     Body opsional: { kind?: "db" | "uploads" | "both" }
 *                                     Default: "db" (kompatibel dengan tombol lama).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { backupService } from "@/services/backup.service";
import { backupScheduler } from "@/services/backup-scheduler.service";
import { settingsService } from "@/services/settings.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);

  const [files, lastRun, nextRun, cfg] = await Promise.all([
    backupService.list(),
    backupScheduler.getLastRunInfo(),
    backupScheduler.getNextRun(),
    settingsService.getBackupConfig(),
  ]);

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const dbFiles = files.filter((f) => f.kind === "db");
  const uploadsFiles = files.filter((f) => f.kind === "uploads");

  return ok({
    dir: backupService.getDir(),
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      sizeText: f.sizeText,
      createdAt: f.createdAt.toISOString(),
      compressed: f.compressed,
      kind: f.kind,
    })),
    summary: {
      count: files.length,
      totalSize,
      totalSizeText: formatBytes(totalSize),
      db: {
        count: dbFiles.length,
        totalSize: dbFiles.reduce((s, f) => s + f.size, 0),
      },
      uploads: {
        count: uploadsFiles.length,
        totalSize: uploadsFiles.reduce((s, f) => s + f.size, 0),
      },
    },
    lastRun: {
      ts: lastRun.ts,
      filename: lastRun.filename,
    },
    nextRun: {
      enabled: nextRun.enabled,
      nextRunAt: nextRun.nextRunAt ? nextRun.nextRunAt.toISOString() : null,
      intervalText: nextRun.intervalText,
    },
    config: cfg,
  });
});

const TriggerSchema = z
  .object({
    kind: z.enum(["db", "uploads", "both"]).optional(),
  })
  .partial();

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);

  // Body opsional. Kalau request dari tombol lama (tanpa body), default "db".
  let kind: "db" | "uploads" | "both" = "db";
  try {
    const json = await req.json();
    const parsed = TriggerSchema.parse(json ?? {});
    if (parsed.kind) kind = parsed.kind;
  } catch {
    // body kosong / bukan JSON → biarkan default
  }

  const out: {
    db?: { filename: string; size: number; sizeText: string };
    uploads?: { filename: string; size: number; sizeText: string };
  } = {};

  if (kind === "db" || kind === "both") {
    const r = await backupScheduler.runOnce();
    out.db = {
      filename: r.filename,
      size: r.size,
      sizeText: formatBytes(r.size),
    };
  }

  if (kind === "uploads" || kind === "both") {
    const f = await backupService.dumpUploads();
    out.uploads = {
      filename: f.name,
      size: f.size,
      sizeText: f.sizeText,
    };
  }

  // Kompatibilitas: kalau hanya db, balas dalam shape lama supaya UI lama
  // (`json.data.filename`, `json.data.sizeText`) tetap jalan.
  if (kind === "db" && out.db) {
    return NextResponse.json({
      success: true,
      data: {
        kind: "db",
        filename: out.db.filename,
        size: out.db.size,
        sizeText: out.db.sizeText,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: { kind, ...out },
  });
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
