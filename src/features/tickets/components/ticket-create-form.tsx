"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, X } from "lucide-react";
import { TicketCategory } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  TRANSACTION: "Transaksi / Order",
  DEPOSIT: "Deposit / Saldo",
  ACCOUNT: "Akun & Login",
  PRODUCT: "Pertanyaan Produk",
  GENERAL: "Umum",
  OTHER: "Lainnya",
};

interface Props {
  defaultSubject?: string;
  defaultCategory?: TicketCategory | null;
  relatedOrderId?: string | null;
  relatedDepositId?: string | null;
}

export function TicketCreateForm({
  defaultSubject = "",
  defaultCategory = null,
  relatedOrderId = null,
  relatedDepositId = null,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(defaultSubject);
  const [category, setCategory] = useState<TicketCategory>(
    defaultCategory ??
      (relatedOrderId
        ? TicketCategory.TRANSACTION
        : relatedDepositId
          ? TicketCategory.DEPOSIT
          : TicketCategory.GENERAL),
  );
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 5) {
        toast.error("Maksimal 5 lampiran.");
        break;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} terlalu besar (maks 5 MB).`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3) {
      toast.error("Subjek minimal 3 karakter.");
      return;
    }
    if (body.trim().length === 0) {
      toast.error("Pesan tidak boleh kosong.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("subject", subject.trim());
      fd.append("body", body.trim());
      fd.append("category", category);
      if (relatedOrderId) fd.append("relatedOrderId", relatedOrderId);
      if (relatedDepositId) fd.append("relatedDepositId", relatedDepositId);
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/tickets", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal membuat tiket.");

      toast.success(`Tiket ${json.data.ticketNumber} berhasil dibuat.`);
      router.push(`/tickets/${json.data.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {(relatedOrderId || relatedDepositId) && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          Terkait{" "}
          {relatedOrderId
            ? `transaksi ${relatedOrderId}`
            : `deposit ${relatedDepositId}`}
          . Info ini akan otomatis dilampirkan ke admin.
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Kategori
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k as TicketCategory)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                category === k
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Subjek
        </label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Contoh: Token PLN belum masuk"
          maxLength={160}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pesan
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Jelaskan masalah atau pertanyaan Anda secara detail…"
          rows={6}
          maxLength={5000}
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-right text-[10px] text-muted-foreground">
          {body.length}/5000
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Lampiran (opsional)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= 5}
          >
            <Paperclip className="mr-1 h-3.5 w-3.5" />
            Tambah File
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Maks 5 file × 5 MB. PNG/JPG/WEBP/GIF/PDF.
          </span>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <span className="truncate" title={f.name}>
                  {f.name}{" "}
                  <span className="text-muted-foreground">
                    ({(f.size / 1024).toFixed(0)} KB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Hapus"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Kirim Tiket
        </Button>
      </div>
    </form>
  );
}
