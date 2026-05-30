/**
 * Tipe data Digiflazz API.
 * Reference: https://developer.digiflazz.com/api/buyer/
 */

// ---- Cek Saldo ----
export interface DigiflazzCekSaldoRequest {
  cmd: "deposit";
  username: string;
  sign: string; // md5(username + apiKey + "depo")
}
export interface DigiflazzCekSaldoData {
  deposit: number;
}

// ---- Price List ----
export interface DigiflazzPriceListRequest {
  cmd: "prepaid" | "pasca";
  username: string;
  sign: string; // md5(username + apiKey + "pricelist")
  code?: string;
  category?: string;
  brand?: string;
  type?: string;
}
export interface DigiflazzProduct {
  product_name: string;
  category: string;
  brand: string;
  type: string;
  seller_name: string;
  price: number;
  buyer_sku_code: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  unlimited_stock: boolean;
  stock: number;
  multi: boolean;
  start_cut_off: string;
  end_cut_off: string;
  desc: string;
}

// ---- Order Transaksi ----
export interface DigiflazzOrderRequest {
  username: string;
  buyer_sku_code: string;
  customer_no: string;
  ref_id: string;
  sign: string; // md5(username + apiKey + ref_id)
  testing?: boolean;
  msg?: string;
  cb_url?: string;
}
export interface DigiflazzOrderData {
  ref_id: string;
  customer_no: string;
  buyer_sku_code: string;
  message: string;
  status: "Pending" | "Sukses" | "Gagal";
  rc: string;            // response code
  sn: string;
  buyer_last_saldo: number;
  price: number;
  tele: string;
  wa: string;
}

// ---- Webhook (transaksi.create / transaksi.update) ----
export interface DigiflazzWebhookPayload {
  data: DigiflazzOrderData;
}

// ---- Wrapper response umum ----
export interface DigiflazzResponse<T> {
  data: T;
}

// ============================================================
// PASCABAYAR (Postpaid) — inquiry tagihan & pembayaran
// ============================================================

// ---- Price List Pascabayar ----
export interface DigiflazzPascaProduct {
  product_name: string;
  category: string;        // umumnya "Pascabayar"
  brand: string;           // PLN, PDAM, BPJS, dll
  seller_name: string;
  admin: number;           // biaya admin
  commission: number;      // komisi buyer
  buyer_sku_code: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  desc: string;
}

// ---- Inquiry / Pay Pascabayar ----
// Detail per lembar tagihan (bentuk berbeda per produk; pakai index signature).
export interface DigiflazzPascaDetail {
  periode?: string;
  nilai_tagihan?: string;
  admin?: string;
  denda?: string;
  [key: string]: string | undefined;
}

export interface DigiflazzPascaDesc {
  tarif?: string;
  daya?: number;
  lembar_tagihan?: number;
  alamat?: string;
  jatuh_tempo?: string;
  detail?: DigiflazzPascaDetail[];
  [key: string]: unknown;
}

// Response inq-pasca & pay-pasca punya bentuk sama (pay menambah `sn`).
export interface DigiflazzPascaData {
  ref_id: string;
  customer_no: string;
  customer_name: string;
  buyer_sku_code: string;
  admin: number;
  message: string;
  status: "Pending" | "Sukses" | "Gagal";
  rc: string;
  periode?: string;
  sn?: string;
  buyer_last_saldo?: number;
  price: number;          // harga yang dipotong dari deposit (cost)
  selling_price?: number; // harga ke client (referensi)
  desc?: DigiflazzPascaDesc;
}
