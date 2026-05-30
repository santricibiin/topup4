import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { Errors } from "@/lib/errors";
import { PostpaidInquirySchema } from "@/schemas/topup.schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentUserFromRequest } from "@/server/auth";
import { transactionService } from "@/services/transaction.service";

export const dynamic = "force-dynamic";

/**
 * Cek tagihan (inquiry) pascabayar.
 * Membuat transaksi PENDING + mengembalikan detail tagihan untuk konfirmasi.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  // Rate limit: inquiry memanggil provider, batasi agar tidak spam.
  rateLimit({
    key: `inq:user:${user.id}`,
    max: 10,
    windowMs: 60_000,
    message: "Terlalu banyak permintaan cek tagihan. Coba lagi sebentar.",
  });
  rateLimit({
    key: `inq:ip:${getClientIp(req)}`,
    max: 20,
    windowMs: 60_000,
  });

  const body = await req.json();
  const input = PostpaidInquirySchema.parse(body);

  const result = await transactionService.inquiryPostpaid({
    userId: user.id,
    productSku: input.productSku,
    customerNo: input.customerNo,
  });

  return ok(result);
});
