import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { getCurrentUserFromRequest } from "@/server/auth";
import { ticketService } from "@/services/ticket.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickets/unread-count
 * Hitung tiket yg ada balasan admin baru tapi user belum baca.
 * Dipakai navbar/bottom-nav untuk badge merah.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return ok({ count: 0 });

  const count = await ticketService.countUnreadForUser(user.id);
  return ok({ count });
});
