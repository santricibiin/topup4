/**
 * WhatsApp Service — singleton lifecycle untuk koneksi Baileys.
 *
 * Tujuan:
 *   - Sediakan socket WA yang persistent dalam proses Next.js.
 *   - Expose state machine untuk UI admin (status, QR, pairing code).
 *   - Sediakan API kirim pesan (OTP & notifikasi transaksi).
 *
 * Kenapa singleton via globalThis?
 *   - Hot-reload Next dev tidak boleh bikin socket baru tiap kali file
 *     di-edit. Pola yang sama dengan `prisma.ts`.
 *   - PM2 jalan single-instance (fork mode) → aman 1 proses 1 socket.
 *
 * Folder session:
 *   - data/wa-session/  (di luar public/, ikut di-backup oleh dumpUploads)
 *
 * State machine:
 *   DISCONNECTED → INITIALIZING → (QR_REQUIRED | PAIRING_REQUIRED) → CONNECTED
 *                                                                  ↘ LOGGED_OUT
 *                                                                  ↘ ERROR
 *
 * Catatan:
 *   - Service ini TIDAK auto-start saat import. Admin harus klik "Start"
 *     di panel, atau ada flag setting `wa.enabled` true → auto-start.
 *   - Kalau session valid → langsung CONNECTED tanpa QR.
 */

import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";

// Baileys di-import dinamis biar build-time tidak error kalau native dep
// (libsignal native) gagal. Akses via getBaileys().
type BaileysModule = typeof import("@whiskeysockets/baileys");
let baileysCache: BaileysModule | null = null;
async function getBaileys(): Promise<BaileysModule> {
  if (baileysCache) return baileysCache;
  baileysCache = await import("@whiskeysockets/baileys");
  return baileysCache;
}

import { logger } from "@/lib/logger";
import { phoneToJid, normalizePhone } from "@/lib/phone";
import { settingsService, SETTING_KEYS } from "@/services/settings.service";

export type WaStatus =
  | "DISCONNECTED"
  | "INITIALIZING"
  | "QR_REQUIRED"
  | "PAIRING_REQUIRED"
  | "CONNECTED"
  | "LOGGED_OUT"
  | "ERROR";

export interface WaState {
  status: WaStatus;
  jid: string | null;
  qr: string | null;            // string EMV mentah
  qrDataUri: string | null;     // PNG data:uri untuk render <img>
  qrExpiresAt: number | null;   // epoch ms
  pairingCode: string | null;   // 8 char (mis. "ABCD-1234")
  pairingExpiresAt: number | null;
  pairingPhone: string | null;
  lastError: string | null;
  lastUpdatedAt: number;
}

const SESSION_DIR_NAME = "wa-session";
const QR_TTL_MS = 60_000;
const PAIRING_TTL_MS = 60_000;

class WaService extends EventEmitter {
  private state: WaState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sock: any = null;
  private starting = false;
  private linkMethodForCurrentSession: "qr" | "pairing" = "qr";
  private pendingPairingPhone: string | null = null;
  private appRoot: string;

  constructor() {
    super();
    this.appRoot = process.cwd();
    this.state = this.makeInitialState();
  }

  private makeInitialState(): WaState {
    return {
      status: "DISCONNECTED",
      jid: null,
      qr: null,
      qrDataUri: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingExpiresAt: null,
      pairingPhone: null,
      lastError: null,
      lastUpdatedAt: Date.now(),
    };
  }

  private getSessionDir(): string {
    return path.join(this.appRoot, "data", SESSION_DIR_NAME);
  }

  private setState(patch: Partial<WaState>) {
    this.state = { ...this.state, ...patch, lastUpdatedAt: Date.now() };
    this.emit("state", this.state);
  }

  /** Snapshot state utk API GET — clone supaya caller tidak bisa mutate. */
  getState(): WaState {
    // expire QR / pairing kalau lewat TTL
    const now = Date.now();
    if (this.state.qrExpiresAt && this.state.qrExpiresAt < now) {
      this.setState({ qr: null, qrDataUri: null, qrExpiresAt: null });
    }
    if (this.state.pairingExpiresAt && this.state.pairingExpiresAt < now) {
      this.setState({
        pairingCode: null,
        pairingExpiresAt: null,
      });
    }
    return { ...this.state };
  }

  isReady(): boolean {
    return this.state.status === "CONNECTED" && !!this.sock;
  }

  /**
   * Mulai koneksi. Idempotent: kalau sudah connected/initializing → no-op.
   * Mode QR vs pairing dibaca dari setting saat fungsi dipanggil.
   */
  async start(opts?: { pairingPhone?: string }): Promise<WaState> {
    if (this.starting) return this.state;
    if (this.state.status === "CONNECTED") return this.state;
    this.starting = true;

    try {
      const cfg = await settingsService.getWaConfig();
      this.linkMethodForCurrentSession = cfg.linkMethod;
      // pairing phone dari opts → fallback ke setting
      const phoneRaw = opts?.pairingPhone ?? cfg.pairingPhone;
      this.pendingPairingPhone = phoneRaw
        ? normalizePhone(phoneRaw)
        : null;

      this.setState({
        status: "INITIALIZING",
        lastError: null,
      });

      const sessionDir = this.getSessionDir();
      await fs.mkdir(sessionDir, { recursive: true });

      const baileys = await getBaileys();
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        Browsers,
      } = baileys;

      const { state: authState, saveCreds } =
        await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: undefined as number[] | undefined,
      }));

      const usePairing = this.linkMethodForCurrentSession === "pairing";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sock = (makeWASocket as any)({
        version,
        browser: Browsers.ubuntu("Chrome"),
        auth: authState,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
      });
      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      // Kalau pairing & belum register → request kode pairing
      if (
        usePairing &&
        !sock.authState.creds.registered &&
        this.pendingPairingPhone
      ) {
        // beri jeda kecil agar socket initial handshake siap
        setTimeout(async () => {
          try {
            const code: string = await sock.requestPairingCode(
              this.pendingPairingPhone!,
            );
            // format "ABCD-EFGH" (4-4) untuk readability
            const formatted =
              code.length === 8
                ? `${code.slice(0, 4)}-${code.slice(4)}`
                : code;
            this.setState({
              status: "PAIRING_REQUIRED",
              pairingCode: formatted,
              pairingExpiresAt: Date.now() + PAIRING_TTL_MS,
              pairingPhone: this.pendingPairingPhone,
            });
            logger.info("wa.pairing.code", { phone: this.pendingPairingPhone });
          } catch (err) {
            logger.error("wa.pairing.request_failed", { err: String(err) });
            this.setState({
              status: "ERROR",
              lastError: `Gagal request pairing code: ${(err as Error).message}`,
            });
          }
        }, 3000);
      }

      sock.ev.on(
        "connection.update",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (update: any) => {
          const { connection, lastDisconnect, qr } = update;

          // QR mode: render QR ke data-uri
          if (qr && !usePairing) {
            try {
              const dataUri = await QRCode.toDataURL(qr, {
                margin: 1,
                width: 320,
              });
              this.setState({
                status: "QR_REQUIRED",
                qr,
                qrDataUri: dataUri,
                qrExpiresAt: Date.now() + QR_TTL_MS,
              });
            } catch (err) {
              logger.error("wa.qr.render_failed", { err: String(err) });
            }
          }

          if (connection === "open") {
            const jid = sock.user?.id ?? null;
            // jid format: "62xxx:NN@s.whatsapp.net" → ambil bagian sebelum ":"
            const cleanJid = typeof jid === "string"
              ? jid.replace(/:[0-9]+/, "")
              : null;
            this.setState({
              status: "CONNECTED",
              jid: cleanJid,
              qr: null,
              qrDataUri: null,
              qrExpiresAt: null,
              pairingCode: null,
              pairingExpiresAt: null,
              lastError: null,
            });
            // persist linked info
            await Promise.all([
              settingsService.set(SETTING_KEYS.WA_LINKED_JID, cleanJid ?? ""),
              settingsService.set(
                SETTING_KEYS.WA_LINKED_AT,
                new Date().toISOString(),
              ),
            ]);
            logger.info("wa.connected", { jid: cleanJid });
          }

          if (connection === "close") {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const loggedOut = reason === DisconnectReason.loggedOut;
            const replaced = reason === DisconnectReason.connectionReplaced;

            logger.warn("wa.disconnected", {
              reason,
              error: String(lastDisconnect?.error ?? "-"),
            });

            this.sock = null;

            if (loggedOut || replaced) {
              // session sudah invalid → hapus folder, butuh re-link manual
              await this.purgeSession().catch(() => {});
              this.setState({
                status: "LOGGED_OUT",
                jid: null,
                lastError: loggedOut
                  ? "Akun ter-logout dari HP. Silakan tautkan ulang."
                  : "Sesi diambil alih perangkat lain.",
              });
              // jangan auto restart
              return;
            }

            // network glitch / restartRequired → auto reconnect
            this.setState({
              status: "DISCONNECTED",
              lastError: `Disconnected (code ${reason ?? "?"})`,
            });
            // auto reconnect dengan backoff sederhana
            setTimeout(() => {
              if (!this.sock) {
                this.start().catch((err) =>
                  logger.error("wa.autorestart_failed", { err: String(err) }),
                );
              }
            }, 5000);
          }
        },
      );

      return this.state;
    } catch (err) {
      logger.error("wa.start.failed", { err: String(err) });
      this.setState({
        status: "ERROR",
        lastError: (err as Error).message,
      });
      this.sock = null;
      throw err;
    } finally {
      this.starting = false;
    }
  }

  /** Stop socket tanpa menghapus session (next start = auto-connect). */
  async stop(): Promise<void> {
    try {
      if (this.sock) {
        // logout = bersihkan session di server WA juga, kita pakai end() saja
        // untuk preserve session
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.sock as any).end?.(undefined);
      }
    } catch (err) {
      logger.warn("wa.stop.err", { err: String(err) });
    }
    this.sock = null;
    this.setState({
      status: "DISCONNECTED",
      qr: null,
      qrDataUri: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingExpiresAt: null,
    });
  }

  /** Logout penuh: hapus session di server WA + file lokal. */
  async unlink(): Promise<void> {
    try {
      if (this.sock?.logout) {
        await this.sock.logout().catch(() => {});
      }
    } catch (err) {
      logger.warn("wa.unlink.logout_err", { err: String(err) });
    }
    this.sock = null;
    await this.purgeSession();
    await Promise.all([
      settingsService.set(SETTING_KEYS.WA_LINKED_JID, ""),
      settingsService.set(SETTING_KEYS.WA_LINKED_AT, ""),
    ]);
    this.setState({
      status: "DISCONNECTED",
      jid: null,
      qr: null,
      qrDataUri: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingExpiresAt: null,
      lastError: null,
    });
  }

  private async purgeSession(): Promise<void> {
    const dir = this.getSessionDir();
    if (!existsSync(dir)) return;
    await fs.rm(dir, { recursive: true, force: true });
  }

  async restart(): Promise<WaState> {
    await this.stop();
    return this.start();
  }

  /** Cek apakah JID terdaftar di WhatsApp. */
  async isOnWhatsApp(phoneE164: string): Promise<boolean> {
    if (!this.isReady() || !this.sock) return false;
    try {
      const result = await this.sock.onWhatsApp(phoneToJid(phoneE164));
      return Array.isArray(result) && result.some((r) => r?.exists);
    } catch (err) {
      logger.warn("wa.onWhatsApp.err", { err: String(err) });
      return false;
    }
  }

  /**
   * Kirim pesan teks. Throw kalau service belum connected.
   * Caller di-rekomendasikan bungkus dalam try/catch.
   */
  async sendText(phoneE164: string, text: string): Promise<void> {
    if (!this.isReady() || !this.sock) {
      throw new Error("WhatsApp belum terhubung.");
    }
    const jid = phoneToJid(phoneE164);
    await this.sock.sendMessage(jid, { text });
  }

  /**
   * Apply template — placeholder simple {{key}}.
   * Variabel yang tidak ada di vars dikosongkan (jangan biarkan placeholder
   * mentah muncul di pesan ke user).
   */
  applyTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
      const v = vars[key];
      return v == null ? "" : String(v);
    });
  }
}

// ---- Singleton via globalThis (aman utk Next dev hot-reload) ----
declare global {
  // eslint-disable-next-line no-var
  var __waService: WaService | undefined;
}

export const waService: WaService = globalThis.__waService ?? new WaService();
if (process.env.NODE_ENV !== "production") {
  globalThis.__waService = waService;
}
