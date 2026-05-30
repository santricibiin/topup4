import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ticketService } from "@/services/ticket.service";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
} from "@/features/tickets/components/ticket-status-badge";
import { TicketStatus } from "@prisma/client";

export const metadata = { title: "Admin · Tiket" };
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const status =
    searchParams.status && searchParams.status in TicketStatus
      ? (searchParams.status as TicketStatus)
      : undefined;

  const items = await ticketService.listForAdmin({
    status,
    search: searchParams.q,
  });

  const STATUS_TABS: Array<{ key: string; label: string }> = [
    { key: "", label: "Semua" },
    { key: "AWAITING_ADMIN", label: "Perlu Direspon" },
    { key: "AWAITING_USER", label: "Menunggu User" },
    { key: "RESOLVED", label: "Selesai" },
    { key: "CLOSED", label: "Ditutup" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <LifeBuoy className="h-6 w-6 text-primary md:h-7 md:w-7" />
          Tiket Bantuan
        </h1>
        <p className="text-sm text-muted-foreground">
          Tangani pertanyaan dan keluhan user. Tiket dengan status{" "}
          <strong>Perlu Direspon</strong> berarti menunggu balasan dari admin.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const active = (status ?? "") === tab.key;
          const href = tab.key
            ? `/admin/tickets?status=${tab.key}`
            : `/admin/tickets`;
          return (
            <Link
              key={tab.key || "all"}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Tidak ada tiket pada filter ini.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((t) => {
                const hasUnread =
                  t.status === TicketStatus.AWAITING_ADMIN ||
                  t.status === TicketStatus.OPEN;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/admin/tickets/${t.id}`}
                      className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/40"
                    >
                      {hasUnread && (
                        <span className="mt-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-destructive" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {t.ticketNumber}
                          </span>
                          <TicketStatusBadge status={t.status} />
                          <TicketPriorityBadge priority={t.priority} />
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.category}
                          </span>
                        </div>
                        <h3 className="mt-1 truncate text-sm font-medium md:text-base">
                          {t.subject}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          {t.user.username}{" "}
                          <span className="opacity-60">·</span>{" "}
                          {t.user.email}
                          <span className="opacity-60"> · </span>
                          {new Date(t.lastMessageAt).toLocaleString("id-ID", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
