/**
 * Deposit providers — daftar penyedia pembayaran QRIS yang didukung.
 *
 * Semua provider memakai flow yang sama: admin paste QRIS statis → sistem
 * konversi ke QRIS dinamis (nominal + kode unik) → Android Notification
 * Forwarder kirim notif saat dana masuk → webhook match nominal & kredit saldo.
 *
 * Perbedaan antar provider hanya:
 *  - `pkg`      : package name aplikasi Android (untuk validasi sumber notif).
 *  - `appName`  : nama aplikasi (informasi untuk admin).
 *  - `method`   : nilai enum DepositMethod yang dipakai saat membuat record.
 *
 * Catatan: enum DepositMethod di DB hanya punya QRIS & DANA. NeoBank (dan
 * provider QRIS lain ke depannya) memakai method QRIS — provider asli tetap
 * tercatat lewat setting `deposit.provider` + field description.
 */

export type DepositMethodValue = "DANA" | "QRIS";

export interface DepositProvider {
  /** Key tersimpan di setting `deposit.provider`. */
  key: string;
  /** Label tampil di panel admin. */
  label: string;
  /** Package name aplikasi Android pengirim notif. */
  pkg: string;
  /** Nama aplikasi (referensi admin). */
  appName: string;
  /** Nilai enum DepositMethod di DB. */
  method: DepositMethodValue;
}

export const DEPOSIT_PROVIDERS: DepositProvider[] = [
  {
    key: "dana",
    label: "DANA",
    pkg: "id.dana",
    appName: "DANA",
    method: "DANA",
  },
  {
    key: "neobank",
    label: "NeoBank (QRIS)",
    pkg: "com.bnc.finance",
    appName: "neobank",
    method: "QRIS",
  },
];

export const DEFAULT_DEPOSIT_PROVIDER = "dana";

const PROVIDER_MAP = new Map(DEPOSIT_PROVIDERS.map((p) => [p.key, p]));

/** Daftar key untuk validasi Zod (z.enum butuh tuple non-empty). */
export const DEPOSIT_PROVIDER_KEYS = DEPOSIT_PROVIDERS.map((p) => p.key) as [
  string,
  ...string[],
];

/** Resolve provider dari key, fallback ke default bila tidak dikenal. */
export function resolveDepositProvider(
  key: string | null | undefined,
): DepositProvider {
  return (key && PROVIDER_MAP.get(key)) || PROVIDER_MAP.get(DEFAULT_DEPOSIT_PROVIDER)!;
}
