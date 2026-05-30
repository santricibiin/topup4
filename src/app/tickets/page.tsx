import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy, Plus } from "lucide-react";
import { TicketStatus } from "@prisma/client";
import { getCurrentUser } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TicketStatusBadge } from "@/features/tickets/components/ticket-status-badge";

export const metadata = { title: "Tiket Bantuan" };
export const dynamic = "force-dynamic";

export default async function MyTicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/tickets");

  const tickets = await ticketService.listForUser(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <LifeBuoy className="h-6 w-6 text-primary md:h-7 md:w-7" />
            Tiket Bantuan
          </h1>
          <p className="text-sm text-muted-foreground">
            Hubungi admin untuk bantuan transaksi, deposit, atau pertanyaan lain.
          </p>
        </div>
        <Button asChild>
          <Link href="/tickets/new">
            <Plus className="mr-1 h-4 w-4" />
            Buat Tiket
          </Link>
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            Belum ada tiket. Klik <strong>Buat Tiket</strong> untuk memulai.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const hasUnread =
              t.status === TicketStatus.AWAITING_USER &&
              (!t.userLastReadAt || t.lastMessageAt > t.userLastReadAt);
            return (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {t.ticketNumber}
                      </span>
                      <TicketStatusBadge status={t.status} />
                      {hasUnread && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-destructive" />
                      )}
                    </div>
                    <h3 className="mt-1 truncate text-sm font-medium md:text-base">
                      {t.subject}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Diperbarui{" "}
                      {new Date(t.lastMessageAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
