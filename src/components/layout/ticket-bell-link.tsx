"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  showLabel?: boolean;
}

/**
 * Tombol akses cepat ke halaman tiket dengan badge jumlah unread.
 * Polling ringan tiap 30 detik supaya badge tetap up-to-date.
 */
export function TicketBellLink({ className, showLabel = false }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/tickets/unread-count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success) {
          setCount(json.data?.count ?? 0);
        }
      } catch {
        // diam.
      }
    }

    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/tickets"
      aria-label={`Tiket bantuan${count > 0 ? ` (${count} belum dibaca)` : ""}`}
      className={cn(
        "relative inline-flex items-center gap-1.5 text-sm transition-colors",
        className,
      )}
    >
      <span className="relative">
        <LifeBuoy className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      {showLabel && <span>Tiket</span>}
    </Link>
  );
}
