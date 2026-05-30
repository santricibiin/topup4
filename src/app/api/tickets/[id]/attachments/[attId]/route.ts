import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/server/api-handler";
import { getCurrentUserFromRequest } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickets/[id]/attachments/[attId]
 * Stream file dari data/uploads/tickets. Auth: owner ATAU admin.
 * Default disposition = inline supaya gambar bisa di-preview di browser.
 * `?download=1` → force download.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("tickets");
  const ticketId = idx >= 0 ? parts[idx + 1] : undefined;
  const attId = parts[parts.length - 1];
  if (!ticketId || !attId) throw Errors.notFound("Lampiran");

  const att = await ticketService.readAttachment(attId);
  if (!att) throw Errors.notFound("Lampiran");
  if (att.message.ticketId !== ticketId) throw Errors.notFound("Lampiran");

  const isOwner = att.message.ticket.userId === user.id;
  const isAdmin = user.role === "ADMIN";
  if (!isOwner && !isAdmin) throw Errors.forbidden("Akses ditolak.");

  // Internal note → admin only.
  if (att.message.isInternal && !isAdmin) {
    throw Errors.forbidden("Akses ditolak.");
  }

  const buffer = await ticketService.readAttachmentFile(att);
  const url = new URL(req.url);
  const dispo = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  // sanitasi nama file utk header
  const safeName = att.originalName.replace(/["\\\r\n]/g, "_");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Length": String(att.size),
      "Content-Disposition": `${dispo}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
