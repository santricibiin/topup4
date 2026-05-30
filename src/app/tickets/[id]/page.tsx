import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";
import { TicketStatusBadge } from "@/features/tickets/components/ticket-status-badge";
import { TicketThread } from "@/features/tickets/components/ticket-thread";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps) {
  const data = await ticketService.getThread({
    ticketId: params.id,
    includeInternal: false,
  });
  return { title: data ? `${data.ticket.ticketNumber} · Tiket` : "Tiket" };
}

export default async function TicketDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/tickets/${params.id}`);

  const data = await ticketService.getThread({
    ticketId: params.id,
    includeInternal: false,
  });
  if (!data) notFound();
  if (data.ticket.userId !== user.id) notFound();

  // Tandai sudah dibaca user.
  await ticketService.markRead({ ticketId: params.id, side: "USER" });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke daftar tiket
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {data.ticket.ticketNumber}
          </span>
          <TicketStatusBadge status={data.ticket.status} />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.ticket.category}
          </span>
        </div>
        <h1 className="mt-2 text-lg font-semibold tracking-tight md:text-xl">
          {data.ticket.subject}
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Dibuat{" "}
          {new Date(data.ticket.createdAt).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        {(data.ticket.relatedOrderId || data.ticket.relatedDepositId) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Terkait:{" "}
            {data.ticket.relatedOrderId && (
              <Link
                href={`/transaction/${data.ticket.relatedOrderId}`}
                className="font-mono text-primary hover:underline"
              >
                {data.ticket.relatedOrderId}
              </Link>
            )}
            {data.ticket.relatedDepositId && (
              <Link
                href={`/deposit/${data.ticket.relatedDepositId}`}
                className="font-mono text-primary hover:underline"
              >
                Deposit
              </Link>
            )}
          </p>
        )}
      </div>

      <TicketThread
        ticketId={data.ticket.id}
        viewerType="USER"
        viewerId={user.id}
        status={data.ticket.status}
        initialMessages={data.messages.map((m) => ({
          id: m.id,
          authorType: m.authorType,
          authorId: m.authorId,
          body: m.body,
          isInternal: m.isInternal,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({
            id: a.id,
            name: a.originalName,
            mimeType: a.mimeType,
            size: a.size,
          })),
        }))}
      />
    </div>
  );
}
