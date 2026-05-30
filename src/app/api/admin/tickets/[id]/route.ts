import { NextRequest } from "next/server";
import { z } from "zod";
import {
  TicketAuthorType,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { ticketService } from "@/services/ticket.service";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(Object.keys(TicketStatus));
const VALID_PRIORITY = new Set(Object.keys(TicketPriority));

function pickId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("tickets");
  const id = idx >= 0 ? parts[idx + 1] : undefined;
  if (!id) throw Errors.notFound("Tiket");
  return id;
}

/** GET /api/admin/tickets/[id] — thread + internal notes. */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const id = pickId(req);

  const data = await ticketService.getThread({
    ticketId: id,
    includeInternal: true,
  });
  if (!data) throw Errors.notFound("Tiket");

  await ticketService.markRead({ ticketId: id, side: "ADMIN" });

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
      assignedAdmin: data.ticket.assignedAdmin,
      user: data.ticket.user,
    },
    messages: data.messages.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorId: m.authorId,
      body: m.body,
      isInternal: m.isInternal,
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

const PatchSchema = z.object({
  status: z
    .string()
    .optional()
    .refine((v) => !v || VALID_STATUS.has(v), "Status tidak valid"),
  priority: z
    .string()
    .optional()
    .refine((v) => !v || VALID_PRIORITY.has(v), "Priority tidak valid"),
  assignedAdminId: z.string().nullable().optional(),
});

/** PATCH /api/admin/tickets/[id] — ubah status/priority/assignedAdmin. */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const admin = await requireAdminApi(req);
  const id = pickId(req);

  const body = await req.json().catch(() => ({}));
  const data = PatchSchema.parse(body);

  if (data.status) {
    await ticketService.setStatus({
      ticketId: id,
      status: data.status as TicketStatus,
      adminId: admin.id,
    });
  }
  if (data.priority || data.assignedAdminId !== undefined) {
    await ticketService.setMeta({
      ticketId: id,
      priority: data.priority as TicketPriority | undefined,
      assignedAdminId: data.assignedAdminId,
    });
  }

  return ok({ updated: true });
});
