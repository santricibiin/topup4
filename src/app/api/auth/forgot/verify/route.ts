import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { ForgotPasswordVerifySchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { otpService } from "@/services/otp.service";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  rateLimit({
    key: `forgot:verify:ip:${ip}`,
    max: 20,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak percobaan reset password.",
  });

  const body = await req.json();
  const input = ForgotPasswordVerifySchema.parse(body);
  const phone = normalizePhone(input.phone);
  if (!phone) throw Errors.badRequest("Nomor HP tidak valid.");

  await otpService.verifyOtp({
    phone,
    purpose: OtpPurpose.RESET_PASSWORD,
    code: input.code,
  });

  await authService.resetPasswordWithOtp({ ...input, phone });

  logger.info("auth.forgot.success", { ip, phone });

  return ok({ success: true });
});
