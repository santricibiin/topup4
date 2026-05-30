import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { RegisterOtpVerifySchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { otpService } from "@/services/otp.service";
import { setSessionCookie } from "@/server/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  rateLimit({
    key: `register:verify:ip:${ip}`,
    max: 20,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak percobaan verifikasi. Coba lagi 1 jam.",
  });

  const body = await req.json();
  const input = RegisterOtpVerifySchema.parse(body);
  const phone = normalizePhone(input.phone);
  if (!phone) throw Errors.badRequest("Nomor HP tidak valid.");

  // Verifikasi OTP — throw kalau salah / expired
  await otpService.verifyOtp({
    phone,
    purpose: OtpPurpose.REGISTER,
    code: input.code,
  });

  // Buat akun (phone_verified otomatis ter-set)
  const user = await authService.registerWithOtp({ ...input, phone });

  // Auto-login setelah daftar
  const session = await authService.login({
    identifier: input.email,
    password: input.password,
  });
  setSessionCookie(session.token, session.expiresAt);

  logger.info("auth.register_otp.success", {
    ip,
    userId: user.id,
    phone,
  });

  return ok({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });
});
