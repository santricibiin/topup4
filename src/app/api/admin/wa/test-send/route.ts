import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { waService } from "@/services/wa.service";
import { normalizePhone } from "@/lib/phone";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  phone: z.string().min(8),
  text: z.string().min(1).max(2000),
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const body = await req.json();
  const input = Schema.parse(body);

  if (!waService.isReady()) {
    throw Errors.badRequest("WhatsApp belum terhubung.");
  }
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw Errors.badRequest("Nomor tidak valid.");
  }
  const onWa = await waService.isOnWhatsApp(phone);
  if (!onWa) {
    throw Errors.badRequest("Nomor tidak terdaftar di WhatsApp.");
  }
  await waService.sendText(phone, input.text);
  return ok({ sent: true, phone });
});
