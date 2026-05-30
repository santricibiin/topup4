import { NextRequest } from "next/server";
import { z } from "zod";
import { TicketCategory, TicketStatus } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { getCurrentUserFromRequest } from "@/server/auth";
import { collectTicketFiles } from "@/server/ticket-form";
import { ticketService } from "@/services/ticket.service";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set(Object.keys(TicketCategory));
const VALID_STATUS = new Set(Object.keys(TicketStatus));

/** GET /api/tickets — list tiket milik user. */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUS.has(statusParam)
      ? (statusParam as TicketStatus)
      : undefined;
  const items = await ticketService.listForUser(user.id, { status });
  return ok({ items });
});

const CreateSchema = z.object({
  subject: z.string().min(3).max(160),
  body: z.string().min(1).max(5000),
  category: z
    .string()
    .optional()
    .refine((v) => !v || VALID_CATEGORIES.has(v), "Kategori tidak valid"),
  relatedOrderId: z.string().max(48).optional().nullable(),
  relatedDepositId: z.string().max(64).optional().nullable(),
});

/**
 * POST /api/tickets — buat tiket baru (multipart/form-data).
 * Fields: subject, body, category?, relatedOrderId?, relatedDepositId?, files[]?
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) throw Errors.badRequest("Body harus multipart/form-data.");

  const parsed = CreateSchema.parse({
    subject: form.get("subject"),
    body: form.get("body"),
    category: form.get("category") ?? undefined,
    relatedOrderId: form.get("relatedOrderId") || null,
    relatedDepositId: form.get("relatedDepositId") || null,
  });

  const files = await collectTicketFiles(form);

  const ticket = await ticketService.createTicket({
    userId: user.id,
    subject: parsed.subject,
    body: parsed.body,
    category: parsed.category as TicketCategory | undefined,
    relatedOrderId: parsed.relatedOrderId,
    relatedDepositId: parsed.relatedDepositId,
    files,
  });

  return ok({ id: ticket.id, ticketNumber: ticket.ticketNumber });
});
