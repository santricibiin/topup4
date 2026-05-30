import { NextRequest } from "next/server";
import { z } from "zod";
import { TicketAuthorType } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { ticketService } from "@/services/ticket.service";
import { collectTicketFiles } from "@/server/ticket-form";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  body: z.string().min(1).max(5000),
  isInternal: z.enum(["0", "1", "true", "false"]).optional(),
});

/**
 * POST /api/admin/tickets/[id]/messages
 * Admin balas tiket atau tambah catatan internal.
 * Field multipart: body (string), isInternal? ("1"/"0"), files[]?.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const admin = await requireAdminApi(req);

  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("tickets");
  const ticketId = idx >= 0 ? parts[idx + 1] : undefined;
  if (!ticketId) throw Errors.notFound("Tiket");

  const form = await req.formData().catch(() => null);
  if (!form) throw Errors.badRequest("Body harus multipart/form-data.");

  const parsed = BodySchema.parse({
    body: form.get("body"),
    isInternal: (form.get("isInternal") as string | null) ?? undefined,
  });
  const isInternal =
    parsed.isInternal === "1" || parsed.isInternal === "true" ? true : false;

  const files = await collectTicketFiles(form);

  const msg = await ticketService.addMessage({
    ticketId,
    authorType: TicketAuthorType.ADMIN,
    authorId: admin.id,
    body: parsed.body,
    isInternal,
    files,
  });

  return ok({ id: msg.id });
});
