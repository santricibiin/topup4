/**
 * POST /api/admin/backup/restore
 *
 * Restore dari file backup yang ada di server. Otomatis dispatch berdasar
 * ekstensi:
 *   - .sql / .sql.gz   → restore database (drop tables + import)
 *   - .tar.gz / .tgz   → restore folder uploads (auto pre-backup)
 *
 * Body: { filename: string }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { backupService } from "@/services/backup.service";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 menit (restore bisa lama)

const Schema = z.object({
  filename: z.string().trim().min(1, "Filename wajib diisi"),
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const json = await req.json().catch(() => ({}));
  const { filename } = Schema.parse(json);

  const isUploads = /\.(tar\.gz|tgz)$/i.test(filename);
  const isDb = /\.(sql|sql\.gz)$/i.test(filename);

  if (!isUploads && !isDb) {
    throw Errors.badRequest(
      "File harus .sql / .sql.gz (database) atau .tar.gz / .tgz (uploads)",
    );
  }

  if (isUploads) {
    const result = await backupService.restoreUploads(filename);
    return ok({
      filename,
      kind: "uploads" as const,
      files: result.files,
      preRestoreBackup: result.preRestoreBackup,
    });
  }

  const result = await backupService.restore(filename);
  return ok({
    filename,
    kind: "db" as const,
    tables: result.tables,
    users: result.users,
  });
});
