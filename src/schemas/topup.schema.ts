import { z } from "zod";

/**
 * Skema input checkout topup.
 * Validasi: SKU produk, nomor tujuan, metode pembayaran.
 */
export const TopupCheckoutSchema = z.object({
  productSku: z.string().min(1, "Produk wajib dipilih"),
  customerNo: z
    .string()
    .min(3, "Nomor tujuan minimal 3 karakter")
    .max(32, "Nomor tujuan maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9._-]+$/, "Karakter tidak valid"),
  serverId: z.string().max(32).optional(),
  paymentMethod: z.enum([
    "BALANCE",
    "DUITKU_VA",
    "DUITKU_QRIS",
    "DUITKU_EWALLET",
    "DUITKU_RETAIL",
    "DUITKU_OTHER",
  ]),
  paymentChannel: z.string().max(16).optional(), // kode Duitku: BC, M2, OV, dll
  pin: z.string().regex(/^\d{6}$/).optional(),    // wajib jika BALANCE & user set PIN
});
export type TopupCheckoutInput = z.infer<typeof TopupCheckoutSchema>;

export const ProductFilterSchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  q: z.string().optional(),
});

/**
 * Skema cek tagihan (inquiry) pascabayar.
 */
export const PostpaidInquirySchema = z.object({
  productSku: z.string().min(1, "Produk wajib dipilih"),
  customerNo: z
    .string()
    .min(3, "Nomor pelanggan minimal 3 karakter")
    .max(32, "Nomor pelanggan maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9._-]+$/, "Karakter tidak valid"),
});
export type PostpaidInquiryInput = z.infer<typeof PostpaidInquirySchema>;

/**
 * Skema bayar tagihan pascabayar — pakai orderId hasil inquiry.
 */
export const PostpaidPaySchema = z.object({
  orderId: z.string().min(1, "Order ID wajib diisi"),
});
export type PostpaidPayInput = z.infer<typeof PostpaidPaySchema>;
