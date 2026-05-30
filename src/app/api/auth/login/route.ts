import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { LoginSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";
import { setSessionCookie } from "@/server/auth";
import { rateLimit, rateLimitReset, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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
    const session = await authService.login(input);
    setSessionCookie(session.token, session.expiresAt);

    // Login sukses → reset hit counter akun
    rateLimitReset(`login:user:${input.identifier.toLowerCase()}`);

    return ok({
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
