import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { LoginSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { otpService } from "@/services/otp.service";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";
import { setSessionCookie } from "@/server/auth";
import { rateLimit, rateLimitReset, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  // Rate limit per IP: 5 percobaan / 15 menit
  rateLimit({
    key: `login:ip:${ip}`,
    max: 5,
    windowMs: 15 * 60_000,
    message: "Terlalu banyak percobaan login dari IP ini. Coba lagi 15 menit.",
  });

  const body = await req.json();
  const input = LoginSchema.parse(body);

  // Rate limit per identifier (mencegah brute force lewat banyak IP)
  rateLimit({
    key: `login:user:${input.identifier.toLowerCase()}`,
    max: 10,
    windowMs: 15 * 60_000,
    message: "Terlalu banyak percobaan untuk akun ini. Coba lagi 15 menit.",
  });

  try {
    // Validasi kredensial dulu (tanpa bikin session)
    const user = await authService.verifyCredentialsForLogin(input);

    // Cek apakah login OTP aktif & user punya phone & WA siap
    const cfg = await settingsService.getWaConfig();
    const waReady = waService.isReady();
    const needsOtp =
      cfg.enabled &&
      cfg.featureOtpLogin &&
      waReady &&
      Boolean(user.phone);

    logger.info("auth.login.otp_check", {
      userId: user.id,
      hasPhone: Boolean(user.phone),
      waEnabled: cfg.enabled,
      featureOtpLogin: cfg.featureOtpLogin,
      waReady,
      needsOtp,
    });

    if (needsOtp && user.phone) {
      // Kirim OTP, JANGAN bikin session
      await otpService.requestOtp({
        phone: user.phone,
        purpose: OtpPurpose.LOGIN,
        ip,
      });
      const masked =
        user.phone.length > 4
          ? "•".repeat(user.phone.length - 4) + user.phone.slice(-4)
          : user.phone;
      // Reset login rate limit karena password udah benar — counter OTP terpisah
      rateLimitReset(`login:user:${input.identifier.toLowerCase()}`);
      return ok({
        needsOtp: true,
        phone: masked,
        phoneFull: user.phone,
        ttlSec: cfg.otpTtlSec,
      });
    }

    // Tidak butuh OTP → bikin session langsung pakai flow klasik
    const session = await authService.login(input);
    setSessionCookie(session.token, session.expiresAt);
    rateLimitReset(`login:user:${input.identifier.toLowerCase()}`);

    return ok({
      needsOtp: false,
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role,
    });
  } catch (err) {
    logger.warn("auth.login.failed", {
      ip,
      identifier: input.identifier,
    });
    throw err;
  }
});
