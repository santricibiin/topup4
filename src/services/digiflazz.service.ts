/**
 * Digiflazz Service — semua interaksi ke API Digiflazz HARUS lewat sini.
 *
 * Signature rule (md5):
 * - cek deposit  : md5(username + apiKey + "depo")
 * - price list   : md5(username + apiKey + "pricelist")
 * - transaksi    : md5(username + apiKey + ref_id)
 *
 * Kredensial (username, apiKey, mode) diambil dari Setting (DB) dengan fallback
 * ke env. Bisa diubah on-the-fly dari panel admin.
 */
import { env } from "@/config/env";
import { md5 } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { HttpClient } from "@/lib/http";
import { logger } from "@/lib/logger";
import { settingsService } from "./settings.service";
import type {
  DigiflazzCekSaldoData,
  DigiflazzOrderData,
  DigiflazzPascaData,
  DigiflazzPascaProduct,
  DigiflazzProduct,
  DigiflazzResponse,
} from "@/types/digiflazz";

class DigiflazzService {
  private readonly http: HttpClient;

  constructor() {
    this.http = new HttpClient({
      baseURL: env.DIGIFLAZZ_BASE_URL,
      serviceName: "digiflazz",
      timeoutMs: 20_000,
    });
  }

  private async getCreds() {
    return settingsService.getDigiflazzCredentials();
  }

  private sign(username: string, apiKey: string, suffix: string): string {
    return md5(`${username}${apiKey}${suffix}`);
  }

  /** Cek saldo deposit Digiflazz. */
  async cekSaldo(): Promise<number> {
    const { username, apiKey } = await this.getCreds();
    const body = {
      cmd: "deposit" as const,
      username,
      sign: this.sign(username, apiKey, "depo"),
    };
    const res = await this.http.post<typeof body, DigiflazzResponse<DigiflazzCekSaldoData>>(
      "/cek-saldo",
      body,
    );
    return res.data.deposit;
  }

  /** Ambil price list (prepaid). */
  async getPriceList(filter?: {
    code?: string;
    category?: string;
    brand?: string;
    type?: string;
  }): Promise<DigiflazzProduct[]> {
    const { username, apiKey } = await this.getCreds();
    const body = {
      cmd: "prepaid" as const,
      username,
      sign: this.sign(username, apiKey, "pricelist"),
      ...filter,
    };
    const res = await this.http.post<
      typeof body,
      DigiflazzResponse<DigiflazzProduct[]>
    >("/price-list", body);
    return res.data;
  }

  /** Ambil price list pascabayar (tagihan). */
  async getPriceListPasca(filter?: {
    code?: string;
    category?: string;
    brand?: string;
  }): Promise<DigiflazzPascaProduct[]> {
    const { username, apiKey } = await this.getCreds();
    const body = {
      cmd: "pasca" as const,
      username,
      sign: this.sign(username, apiKey, "pricelist"),
      ...filter,
    };
    const res = await this.http.post<
      typeof body,
      DigiflazzResponse<DigiflazzPascaProduct[]>
    >("/price-list", body);
    return res.data;
  }

  /**
   * Inquiry tagihan pascabayar (cek tagihan).
   * `ref_id` MUST sama dengan orderId Transaction agar idempotent & bisa dibayar.
   */
  async inquiryPostpaid(params: {
    refId: string;
    sku: string;
    customerNo: string;
    testing?: boolean;
  }): Promise<DigiflazzPascaData> {
    const { username, apiKey, mode } = await this.getCreds();
    const body = {
      commands: "inq-pasca" as const,
      username,
      buyer_sku_code: params.sku,
      customer_no: params.customerNo,
      ref_id: params.refId,
      sign: this.sign(username, apiKey, params.refId),
      testing: params.testing ?? mode === "development",
    };

    try {
      const res = await this.http.post<
        typeof body,
        DigiflazzResponse<DigiflazzPascaData>
      >("/transaction", body);
      return res.data;
    } catch (err) {
      logger.error("digiflazz.inquiryPostpaid.fail", { refId: params.refId });
      throw Errors.digiflazz("Gagal cek tagihan ke Digiflazz.", { cause: String(err) });
    }
  }

  /**
   * Bayar tagihan pascabayar (bayar tagihan).
   * `ref_id` HARUS sama dengan ref_id yang dipakai saat inquiry.
   */
  async payPostpaid(params: {
    refId: string;
    sku: string;
    customerNo: string;
    cbUrl?: string;
    testing?: boolean;
  }): Promise<DigiflazzPascaData> {
    const { username, apiKey, mode } = await this.getCreds();
    const body = {
      commands: "pay-pasca" as const,
      username,
      buyer_sku_code: params.sku,
      customer_no: params.customerNo,
      ref_id: params.refId,
      sign: this.sign(username, apiKey, params.refId),
      testing: params.testing ?? mode === "development",
      cb_url: params.cbUrl,
    };

    try {
      const res = await this.http.post<
        typeof body,
        DigiflazzResponse<DigiflazzPascaData>
      >("/transaction", body);
      return res.data;
    } catch (err) {
      logger.error("digiflazz.payPostpaid.fail", { refId: params.refId });
      throw Errors.digiflazz("Gagal bayar tagihan ke Digiflazz.", { cause: String(err) });
    }
  }

  /**
   * Eksekusi order ke Digiflazz.
   * `ref_id` MUST sama dengan orderId di tabel Transaction (idempotency).
   */
  async order(params: {
    refId: string;
    sku: string;
    customerNo: string;
    cbUrl?: string;
    testing?: boolean;
  }): Promise<DigiflazzOrderData> {
    const { username, apiKey, mode } = await this.getCreds();
    const body = {
      username,
      buyer_sku_code: params.sku,
      customer_no: params.customerNo,
      ref_id: params.refId,
      sign: this.sign(username, apiKey, params.refId),
      testing: params.testing ?? mode === "development",
      cb_url: params.cbUrl,
    };

    try {
      const res = await this.http.post<
        typeof body,
        DigiflazzResponse<DigiflazzOrderData>
      >("/transaction", body);
      return res.data;
    } catch (err) {
      logger.error("digiflazz.order.fail", { refId: params.refId });
      throw Errors.digiflazz("Gagal menghubungi Digiflazz.", { cause: String(err) });
    }
  }

  /** Cek status transaksi (untuk polling fallback). */
  async checkStatus(refId: string): Promise<DigiflazzOrderData> {
    const { username, apiKey } = await this.getCreds();
    const body = {
      username,
      ref_id: refId,
      sign: this.sign(username, apiKey, refId),
      status: "Pending",
    };
    const res = await this.http.post<
      typeof body,
      DigiflazzResponse<DigiflazzOrderData>
    >("/transaction", body);
    return res.data;
  }
}

export const digiflazzService = new DigiflazzService();
