"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TicketPriority, TicketStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
}

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: TicketStatus.OPEN, label: "Buka kembali" },
  { value: TicketStatus.RESOLVED, label: "Tandai selesai" },
  { value: TicketStatus.CLOSED, label: "Tutup tiket" },
];

const PRIORITY_OPTIONS: TicketPriority[] = [
  TicketPriority.LOW,
  TicketPriority.NORMAL,
  TicketPriority.HIGH,
  TicketPriority.URGENT,
];

export function AdminTicketActions({ ticketId, status, priority }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(data: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal mengubah tiket.");
      toast.success("Tiket diperbarui.");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </h2>
        <div className="grid grid-cols-1 gap-1.5">
          {STATUS_OPTIONS.filter((s) => s.value !== status).map((s) => (
            <Button
              key={s.value}
              variant={s.value === TicketStatus.CLOSED ? "outline" : "default"}
              size="sm"
              disabled={busy !== null}
              onClick={() => patch({ status: s.value }, `status-${s.value}`)}
              className={
                s.value === TicketStatus.CLOSED
                  ? "text-destructive hover:bg-destructive/10"
                  : ""
              }
            >
              {busy === `status-${s.value}` && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Prioritas
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {PRIORITY_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy !== null}
              onClick={() => patch({ priority: p }, `priority-${p}`)}
              className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                priority === p
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
