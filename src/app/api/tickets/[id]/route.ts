import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { getCurrentUserFromRequest } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

function pickId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("tickets");
  const id = idx >= 0 ? parts[idx + 1] : undefined;
  if (!id) throw Errors.notFound("Tiket");
  return id;
}

/** GET /api/tickets/[id] — thread (owner saja). */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const id = pickId(req);
  const data = await ticketService.getThread({
    ticketId: id,
    includeInternal: false,
  });
  if (!data) throw Errors.notFound("Tiket");
  if (data.ticket.userId !== user.id) throw Errors.forbidden("Akses ditolak.");

  await ticketService.markRead({ ticketId: id, side: "USER" });

  return ok({
    ticket: {
      id: data.ticket.id,
      ticketNumber: data.ticket.ticketNumber,
      subject: data.ticket.subject,
      category: data.ticket.category,
      status: data.ticket.status,
      priority: data.ticket.priority,
      createdAt: data.ticket.createdAt,
      lastMessageAt: data.ticket.lastMessageAt,
      relatedOrderId: data.ticket.relatedOrderId,
      relatedDepositId: data.ticket.relatedDepositId,
    },
    messages: data.messages.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorId: m.authorId,
      body: m.body,
      createdAt: m.createdAt,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        name: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
      })),
    })),
  });
});
