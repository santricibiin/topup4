import { NextRequest } from "next/server";
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { ticketService } from "@/services/ticket.service";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(Object.keys(TicketStatus));
const VALID_PRIORITY = new Set(Object.keys(TicketPriority));
const VALID_CATEGORY = new Set(Object.keys(TicketCategory));

/** GET /api/admin/tickets — list dengan filter. */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const url = new URL(req.url);

  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("q") ?? undefined;

  const items = await ticketService.listForAdmin({
    status: status && VALID_STATUS.has(status) ? (status as TicketStatus) : undefined,
    priority:
      priority && VALID_PRIORITY.has(priority)
        ? (priority as TicketPriority)
        : undefined,
    category:
      category && VALID_CATEGORY.has(category)
        ? (category as TicketCategory)
        : undefined,
    search,
  });

  const openCount = await ticketService.countOpenForAdmin();

  return ok({
    items: items.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      lastMessageAt: t.lastMessageAt,
      createdAt: t.createdAt,
      relatedOrderId: t.relatedOrderId,
      relatedDepositId: t.relatedDepositId,
      user: t.user,
      assignedAdmin: t.assignedAdmin,
      hasUnread:
        !t.adminLastReadAt || t.lastMessageAt > t.adminLastReadAt
          ? t.status === TicketStatus.AWAITING_ADMIN ||
            t.status === TicketStatus.OPEN
          : false,
    })),
    openCount,
  });
});
