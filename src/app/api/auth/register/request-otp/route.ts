import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import {
  RegisterOtpRequestSchema,
} from "@/schemas/auth.schema";
import { otpService } from "@/services/otp.service";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  rateLimit({
    key: `otp:register:ip:${ip}`,
    max: 10,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak permintaan OTP dari IP ini. Coba lagi 1 jam.",
  });

  const body = await req.json();
  const input = RegisterOtpRequestSchema.parse(body);
  const phone = normalizePhone(input.phone);
  if (!phone) throw Errors.badRequest("Nomor HP tidak valid.");

  // Cek apakah nomor sudah dipakai user lain — biar tidak buang OTP percuma
  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) {
    throw Errors.conflict("Nomor HP sudah terdaftar. Silakan login.");
  }

  const result = await otpService.requestOtp({
    phone,
    purpose: OtpPurpose.REGISTER,
    ip,
  });

  return ok({ phone, ttlSec: result.ttlSec });
});
