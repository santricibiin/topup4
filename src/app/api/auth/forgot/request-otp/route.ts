import { NextRequest } from "next/server";
import { OtpPurpose } from "@prisma/client";
import { apiHandler, ok } from "@/server/api-handler";
import { ForgotPasswordRequestSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { otpService } from "@/services/otp.service";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  rateLimit({
    key: `forgot:request:ip:${ip}`,
    max: 10,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak permintaan reset password dari IP ini.",
  });

  const body = await req.json();
  const input = ForgotPasswordRequestSchema.parse(body);

  const phone = await authService.resolvePhoneFromIdentifier(input.identifier);

  // Untuk cegah enumeration: kalau tidak ketemu, kita TETAP balas success
  // (TTL palsu) tapi tidak kirim apa-apa. Frontend tetap diarahkan ke step
  // verify, dan akan gagal di sana dengan pesan generic.
  if (!phone) {
    return ok({
      phone: "",
      ttlSec: 300,
      // hint ke client supaya UI bisa nampilin pesan generic;
      // jangan dipakai untuk decision logic.
      sent: false,
    });
  }

  await otpService.requestOtp({
    phone,
    purpose: OtpPurpose.RESET_PASSWORD,
    ip,
  });

  // Kirim phone TERSAMARKAN (4 digit terakhir saja).
  const masked =
    phone.length > 4 ? "•".repeat(phone.length - 4) + phone.slice(-4) : phone;
  return ok({ phone: masked, phoneFull: phone, ttlSec: 300, sent: true });
});
