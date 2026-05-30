"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Lock,
  Paperclip,
  ShieldCheck,
  User as UserIcon,
  X,
  Download,
  FileText,
} from "lucide-react";
import { TicketAuthorType, TicketStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ThreadMessage {
  id: string;
  authorType: TicketAuthorType;
  authorId: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
  attachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }>;
}

interface Props {
  ticketId: string;
  viewerType: "USER" | "ADMIN";
  viewerId: string;
  status: TicketStatus;
  initialMessages: ThreadMessage[];
}

export function TicketThread({
  ticketId,
  viewerType,
  viewerId,
  status,
  initialMessages,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isInternal, setIsInternal] = useState(false);

  const closed = status === TicketStatus.CLOSED;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      toast.error("Pesan tidak boleh kosong.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("body", body.trim());
      if (viewerType === "ADMIN" && isInternal) fd.append("isInternal", "1");
      for (const f of files) fd.append("files", f);

      const url =
        viewerType === "ADMIN"
          ? `/api/admin/tickets/${ticketId}/messages`
          : `/api/tickets/${ticketId}/messages`;
      const res = await fetch(url, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal mengirim pesan.");

      setBody("");
      setFiles([]);
      setIsInternal(false);
      // Refresh agar list message + status update.
      router.refresh();
      toast.success("Pesan terkirim.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} viewerType={viewerType} viewerId={viewerId} ticketId={ticketId} />
        ))}
      </div>

      {closed ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Tiket sudah ditutup. Silakan buat tiket baru jika butuh bantuan
          lebih lanjut.
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              isInternal ? "Catatan internal (tidak terlihat user)…" : "Tulis balasan…"
            }
            rows={3}
            maxLength={5000}
            className={cn(
              "w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2",
              isInternal
                ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20"
                : "border-input focus:border-primary focus:ring-primary/20",
            )}
          />

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
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
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
                Lampiran
              </Button>
              {viewerType === "ADMIN" && (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  Catatan internal
                </label>
              )}
            </div>
            <Button type="submit" disabled={submitting || !body.trim()}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Kirim
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Bubble({
  m,
  viewerType,
  viewerId,
  ticketId,
}: {
  m: ThreadMessage;
  viewerType: "USER" | "ADMIN";
  viewerId: string;
  ticketId: string;
}) {
  if (m.authorType === TicketAuthorType.SYSTEM) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {m.body}
        </span>
      </div>
    );
  }

  const isMine =
    (viewerType === "USER" && m.authorType === TicketAuthorType.USER && m.authorId === viewerId) ||
    (viewerType === "ADMIN" && m.authorType === TicketAuthorType.ADMIN);

  const isAdminMsg = m.authorType === TicketAuthorType.ADMIN;

  return (
    <div className={cn("flex gap-2", isMine ? "justify-end" : "justify-start")}>
      {!isMine && (
        <div
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-white",
            isAdminMsg
              ? "bg-gradient-to-br from-violet-500 to-fuchsia-600"
              : "bg-gradient-to-br from-slate-500 to-slate-700",
          )}
        >
          {isAdminMsg ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <UserIcon className="h-4 w-4" />
          )}
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] space-y-2 rounded-2xl px-3 py-2 text-sm shadow-sm",
          m.isInternal
            ? "border border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
            : isMine
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground ring-1 ring-border",
        )}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
          {m.isInternal && <Lock className="h-3 w-3" />}
          {isAdminMsg ? "Admin" : "User"}
          <span>·</span>
          <span>
            {new Date(m.createdAt).toLocaleString("id-ID", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {m.body}
        </div>
        {m.attachments.length > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
            {m.attachments.map((a) => (
              <Attachment key={a.id} att={a} ticketId={ticketId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Attachment({
  att,
  ticketId,
}: {
  att: { id: string; name: string; mimeType: string; size: number };
  ticketId: string;
}) {
  const isImage = att.mimeType.startsWith("image/");
  const url = `/api/tickets/${ticketId}/attachments/${att.id}`;

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={att.name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      </a>
    );
  }
  return (
    <a
      href={`${url}?download=1`}
      className="flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-xs text-foreground hover:border-primary/40"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={att.name}>
        {att.name}
      </span>
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
    </a>
  );
}
