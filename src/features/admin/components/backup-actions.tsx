"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Upload, Loader2, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/button";

type Busy = null | "db" | "uploads" | "both" | "upload";

export function BackupActions() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);

  async function handleRun(kind: "db" | "uploads" | "both") {
    if (busy) return;
    setBusy(kind);
    const label =
      kind === "db"
        ? "backup database"
        : kind === "uploads"
          ? "backup uploads"
          : "backup database + uploads";
    const tid = toast.loading(`Menjalankan ${label}...`);
    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? `Backup gagal`);
      }

      // Format pesan sukses sesuai tipe
      const data = json.data ?? {};
      const parts: string[] = [];
      if (data.db) parts.push(`DB: ${data.db.filename} (${data.db.sizeText})`);
      if (data.uploads)
        parts.push(`Uploads: ${data.uploads.filename} (${data.uploads.sizeText})`);
      // Shape lama (kind=db default)
      if (!data.db && !data.uploads && data.filename) {
        parts.push(`${data.filename} (${data.sizeText ?? ""})`);
      }
      toast.success(`Selesai. ${parts.join(" · ")}`, { id: tid, duration: 6000 });

      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(file: File) {
    setBusy("upload");
    const tid = toast.loading(`Mengupload ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/backup/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Upload gagal");
      }
      const kindLabel = json.data?.kind === "uploads" ? "uploads" : "database";
      toast.success(`Berhasil upload ${kindLabel}: ${json.data.filename}`, {
        id: tid,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const anyBusy = busy !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={() => handleRun("db")}
        disabled={anyBusy}
        className="gap-2"
      >
        {busy === "db" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Backup DB
      </Button>

      <Button
        type="button"
        variant="secondary"
        onClick={() => handleRun("uploads")}
        disabled={anyBusy}
        className="gap-2"
      >
        {busy === "uploads" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FolderArchive className="h-4 w-4" />
        )}
        Backup Uploads
      </Button>

      <Button
        type="button"
        variant="secondary"
        onClick={() => handleRun("both")}
        disabled={anyBusy}
        className="gap-2"
      >
        {busy === "both" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Backup Keduanya
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={anyBusy}
        className="gap-2"
      >
        {busy === "upload" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Upload Backup
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept=".sql,.sql.gz,.gz,.tar.gz,.tgz,application/sql,application/gzip,application/x-gzip,application/x-tar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
    </div>
  );
}
