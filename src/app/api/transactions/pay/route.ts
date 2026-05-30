import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { Errors } from "@/lib/errors";
import { PostpaidPaySchema } from "@/schemas/topup.schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentUserFromRequest } from "@/server/auth";
import { transactionService } from "@/services/transaction.service";

export const dynamic = "force-dynamic";

/**
 * Bayar tagihan pascabayar.
 * Memotong saldo lalu mengeksekusi pembayaran ke provider (ref_id = orderId inquiry).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  rateLimit({
    key: `pay:user:${user.id}`,
    max: 10,
    windowMs: 60_000,
    message: "Terlalu banyak transaksi. Coba lagi sebentar.",
  });
  rateLimit({
    key: `pay:ip:${getClientIp(req)}`,
    max: 20,
    windowMs: 60_000,
  });

  const body = await req.json();
  const input = PostpaidPaySchema.parse(body);

  const tx = await transactionService.payPostpaid({
    userId: user.id,
    orderId: input.orderId,
  });

  return ok({
    orderId: tx.orderId,
    status: tx.status,
    providerSn: tx.providerSn,
    providerMessage: tx.providerMessage,
  });
});
