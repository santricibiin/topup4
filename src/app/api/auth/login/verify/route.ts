import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { LoginOtpVerifySchema } from "@/schemas/auth.schema";
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
    key: `login:verify:ip:${ip}`,
    max: 20,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak percobaan verifikasi. Coba lagi 1 jam.",
  });

  const body = await req.json();
  const input = LoginOtpVerifySchema.parse(body);
  const phone = normalizePhone(input.phone);
  if (!phone) throw Errors.badRequest("Nomor HP tidak valid.");

  // Verifikasi OTP — throw kalau salah / expired
  await otpService.verifyOtp({
    phone,
    purpose: OtpPurpose.LOGIN,
    code: input.code,
  });

  // OTP valid → bikin session
  const session = await authService.loginWithOtp(phone);
  setSessionCookie(session.token, session.expiresAt);

  logger.info("auth.login_otp.success", {
    ip,
    userId: session.user.id,
  });

  return ok({
    id: session.user.id,
    email: session.user.email,
    username: session.user.username,
    role: session.user.role,
  });
});
