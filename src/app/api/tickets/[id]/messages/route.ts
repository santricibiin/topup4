import { NextRequest } from "next/server";
import { z } from "zod";
import { TicketAuthorType } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { getCurrentUserFromRequest } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";
import { collectTicketFiles } from "@/server/ticket-form";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  body: z.string().min(1).max(5000),
});

/**
 * POST /api/tickets/[id]/messages — user balas tiket (multipart/form-data).
 * Field: body (string), files[] (optional, maks 5 file × 5 MB).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("tickets");
  const ticketId = idx >= 0 ? parts[idx + 1] : undefined;
  if (!ticketId) throw Errors.notFound("Tiket");

  // Pastikan owner.
  const thread = await ticketService.getThread({
    ticketId,
    includeInternal: false,
  });
  if (!thread) throw Errors.notFound("Tiket");
  if (thread.ticket.userId !== user.id) throw Errors.forbidden("Akses ditolak.");

  const form = await req.formData().catch(() => null);
  if (!form) throw Errors.badRequest("Body harus multipart/form-data.");

  const parsed = BodySchema.parse({ body: form.get("body") });
  const files = await collectTicketFiles(form);

  const msg = await ticketService.addMessage({
    ticketId,
    authorType: TicketAuthorType.USER,
    authorId: user.id,
    body: parsed.body,
    files,
  });

  return ok({ id: msg.id });
});
