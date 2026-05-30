import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ticketService } from "@/services/ticket.service";
import { requireAdminPage } from "@/server/admin";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
} from "@/features/tickets/components/ticket-status-badge";
import { TicketThread } from "@/features/tickets/components/ticket-thread";
import { AdminTicketActions } from "@/features/admin/components/admin-ticket-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps) {
  const data = await ticketService.getThread({
    ticketId: params.id,
    includeInternal: true,
  });
  return {
    title: data ? `${data.ticket.ticketNumber} · Admin Tiket` : "Tiket",
  };
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const admin = await requireAdminPage();

  const data = await ticketService.getThread({
    ticketId: params.id,
    includeInternal: true,
  });
  if (!data) notFound();

  await ticketService.markRead({ ticketId: params.id, side: "ADMIN" });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/tickets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke daftar tiket
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {data.ticket.ticketNumber}
              </span>
              <TicketStatusBadge status={data.ticket.status} />
              <TicketPriorityBadge priority={data.ticket.priority} />
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
                    href={`/admin/transactions?q=${data.ticket.relatedOrderId}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {data.ticket.relatedOrderId}
                  </Link>
                )}
                {data.ticket.relatedDepositId && (
                  <Link
                    href={`/admin/deposits`}
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
            viewerType="ADMIN"
            viewerId={admin.id}
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

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              User
            </h2>
            <p className="mt-2 text-sm font-medium">
              {data.ticket.user.fullName ?? data.ticket.user.username}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {data.ticket.user.email}
            </p>
            <Link
              href={`/admin/users?q=${data.ticket.user.username}`}
              className="mt-2 inline-flex text-[11px] text-primary hover:underline"
            >
              Lihat profil →
            </Link>
          </div>

          <AdminTicketActions
            ticketId={data.ticket.id}
            status={data.ticket.status}
            priority={data.ticket.priority}
          />
        </aside>
      </div>
    </div>
  );
}
