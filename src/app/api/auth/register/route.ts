import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { authService } from "@/services/auth.service";
import { RegisterSchema } from "@/schemas/auth.schema";
import { setSessionCookie } from "@/server/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const POST = apiHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  // Rate limit: 5 pendaftaran / 1 jam per IP — cegah account spam
  rateLimit({
    key: `register:ip:${ip}`,
    max: 5,
    windowMs: 60 * 60_000,
    message: "Terlalu banyak pendaftaran dari IP ini. Coba lagi 1 jam.",
  });

  const body = await req.json();
  const input = RegisterSchema.parse(body);

  const user = await authService.register(input);
  const session = await authService.login({
    identifier: input.email,
    password: input.password,
  });
  setSessionCookie(session.token, session.expiresAt);

  logger.info("auth.register.success", {
    ip,
    userId: user.id,
    email: user.email,
  });

  return ok({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  });
});
