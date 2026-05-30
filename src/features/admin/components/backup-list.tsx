"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Trash2,
  RotateCcw,
  Archive,
  FileArchive,
  Database,
  FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export type BackupKind = "db" | "uploads";

interface BackupFile {
  name: string;
  size: number;
  sizeText: string;
  createdAt: string;
  compressed: boolean;
  kind: BackupKind;
}

interface Props {
  files: BackupFile[];
}

type Action = "restore" | "delete" | null;

export function BackupList({ files }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<{
    name: string;
    kind: BackupKind;
    action: Action;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (!target) return;
    setBusy(true);
    const tid = toast.loading(
      target.action === "restore"
        ? `Restore dari ${target.name}...`
        : `Menghapus ${target.name}...`,
    );
    try {
      if (target.action === "delete") {
        const res = await fetch(
          `/api/admin/backup/${encodeURIComponent(target.name)}`,
          { method: "DELETE" },
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? "Hapus gagal");
        }
        toast.success(`File ${target.name} dihapus`, { id: tid });
      } else if (target.action === "restore") {
        const res = await fetch("/api/admin/backup/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: target.name }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? "Restore gagal");
        }
        const d = json.data ?? {};
        if (d.kind === "uploads") {
          const extra = d.preRestoreBackup
            ? ` Auto-backup lama: ${d.preRestoreBackup}`
            : "";
          toast.success(
            `Restore uploads selesai: ${d.files} file.${extra}`,
            { id: tid, duration: 7000 },
          );
        } else {
          toast.success(
            `Restore DB selesai: ${d.tables} tabel, ${d.users} user`,
            { id: tid, duration: 6000 },
          );
        }
      }
      setTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setBusy(false);
    }
  }

  if (files.length === 0) {
    return (
      <div className="grid place-items-center gap-2 px-4 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Archive className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">Belum ada backup</div>
        <p className="max-w-xs text-xs text-muted-foreground">
          Klik tombol &ldquo;Backup DB&rdquo; atau &ldquo;Backup Uploads&rdquo;
          untuk membuat snapshot pertama.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile list */}
      <ul className="divide-y divide-border md:hidden">
        {files.map((f) => (
          <li key={f.name} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-3">
              <FileIcon kind={f.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs font-medium">
                  {f.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <KindBadge kind={f.kind} />
                  <span className="tabular-nums">{f.sizeText}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {formatDate(f.createdAt)}
                  </span>
                  {f.compressed && (
                    <Badge variant="secondary" className="ml-1">
                      gzip
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <RowActions
              file={f}
              onRestore={() =>
                setTarget({ name: f.name, kind: f.kind, action: "restore" })
              }
              onDelete={() =>
                setTarget({ name: f.name, kind: f.kind, action: "delete" })
              }
            />
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">File</th>
              <th className="px-4 py-3 text-left">Tipe</th>
              <th className="px-4 py-3 text-right">Ukuran</th>
              <th className="px-4 py-3 text-left">Dibuat</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {files.map((f) => (
              <tr key={f.name} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileIcon kind={f.kind} small />
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">
                        {f.name}
                      </div>
                      {f.compressed && (
                        <Badge variant="secondary" className="mt-0.5">
                          gzip
                        </Badge>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <KindBadge kind={f.kind} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {f.sizeText}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                  {formatDate(f.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions
                    file={f}
                    onRestore={() =>
                      setTarget({
                        name: f.name,
                        kind: f.kind,
                        action: "restore",
                      })
                    }
                    onDelete={() =>
                      setTarget({
                        name: f.name,
                        kind: f.kind,
                        action: "delete",
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={target !== null}
        title={
          target?.action === "restore"
            ? target.kind === "uploads"
              ? "Restore Folder Uploads?"
              : "Restore Database?"
            : "Hapus File Backup?"
        }
        description={
          target?.action === "restore" ? (
            target.kind === "uploads" ? (
              <>
                <p>
                  Folder <span className="font-mono">data/uploads/</span> akan{" "}
                  <span className="font-semibold text-destructive">
                    diganti total
                  </span>{" "}
                  oleh isi file:
                </p>
                <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {target?.name}
                </p>
                <p className="mt-2 text-xs">
                  Sistem otomatis bikin pre-restore backup di folder yang sama
                  sebelum mengganti, jadi bisa di-rollback. Operasi ini tidak
                  bisa di-undo dari UI.
                </p>
              </>
            ) : (
              <>
                <p>
                  Database saat ini akan{" "}
                  <span className="font-semibold text-destructive">
                    ditimpa total
                  </span>{" "}
                  oleh isi file:
                </p>
                <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {target?.name}
                </p>
                <p className="mt-2 text-xs">
                  Pastikan Anda sudah backup terbaru sebelum restore. Operasi
                  ini tidak bisa di-undo.
                </p>
              </>
            )
          ) : (
            <>
              <p>
                File berikut akan dihapus permanen dari server (tidak bisa
                di-undo):
              </p>
              <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {target?.name}
              </p>
            </>
          )
        }
        confirmLabel={
          target?.action === "restore" ? "Restore Sekarang" : "Hapus File"
        }
        variant="destructive"
        loading={busy}
        onConfirm={handleConfirm}
        onClose={() => !busy && setTarget(null)}
      />
    </>
  );
}

function FileIcon({ kind, small = false }: { kind: BackupKind; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-9 w-9";
  const icon = small ? "h-4 w-4" : "h-4 w-4";
  if (kind === "uploads") {
    return (
      <div
        className={`grid ${size} shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400`}
      >
        <FolderArchive className={icon} />
      </div>
    );
  }
  return (
    <div
      className={`grid ${size} shrink-0 place-items-center rounded-md bg-primary/10 text-primary`}
    >
      <Database className={icon} />
    </div>
  );
}

function KindBadge({ kind }: { kind: BackupKind }) {
  if (kind === "uploads") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        <FolderArchive className="h-3 w-3" />
        Uploads
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Database className="h-3 w-3" />
      Database
    </Badge>
  );
}

function RowActions({
  file,
  onRestore,
  onDelete,
}: {
  file: BackupFile;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <a
          href={`/api/admin/backup/${encodeURIComponent(file.name)}`}
          download={file.name}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRestore}
        className="gap-1.5"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDelete}
        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Hapus
      </Button>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

