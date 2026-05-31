/**
 * POST   /api/push/subscribe   → simpan / refresh subscription device user
 * DELETE /api/push/subscribe   → hapus subscription (body: { endpoint })
 *
 * Subscription dibuat di client via PushManager.subscribe() lalu dikirim ke
 * sini. Wajib login — subscription selalu terikat ke user.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { Errors } from "@/lib/errors";
import { getCurrentUserFromRequest } from "@/server/auth";
import { pushService } from "@/services/push.service";

export const dynamic = "force-dynamic";

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(512),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(512),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  if (!pushService.isConfigured()) {
    throw Errors.badRequest("Push notification belum dikonfigurasi server.");
  }

  const body = await req.json().catch(() => ({}));
  const data = SubscribeSchema.parse(body);

  await pushService.saveSubscription({
    userId: user.id,
    endpoint: data.endpoint,
    p256dh: data.keys.p256dh,
    auth: data.keys.auth,
    userAgent: req.headers.get("user-agent"),
  });

  return ok({ subscribed: true });
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  const body = await req.json().catch(() => ({}));
  const data = UnsubscribeSchema.parse(body);

  await pushService.removeSubscription(data.endpoint);

  return ok({ unsubscribed: true });
});
