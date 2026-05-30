/**
 * OTP Service — generate/verify kode 6 digit untuk register & reset password.
 *
 * Aturan:
 *   - Kode 6 digit numeric. Disimpan sebagai bcrypt hash (jangan plaintext).
 *   - Per (phone, purpose): hanya 1 OtpCode ACTIVE. Generate baru otomatis
 *     mengganti yang lama (di-set EXPIRED).
 *   - Cooldown resend: tidak boleh request OTP baru dalam X detik dari
 *     `wa.otp.resendCooldownSec`.
 *   - Max attempt verify: kalau salah `wa.otp.maxAttempt` kali → EXPIRED.
 *   - TTL: `wa.otp.ttlSec` detik (default 300 = 5 menit).
 *
 * Pesan dikirim via WaService dengan template dari Setting:
 *   - REGISTER       → wa.tpl.otpRegister
 *   - RESET_PASSWORD → wa.tpl.otpReset
 */

import { OtpPurpose, OtpStatus, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";
import { settingsService, SETTING_KEYS } from "@/services/settings.service";
import { waService } from "@/services/wa.service";

interface RequestOtpInput {
  phone: string;            // E.164 sudah di-normalisasi (62...)
  purpose: OtpPurpose;
  ip?: string | null;
}

interface VerifyOtpInput {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}

class OtpService {
  /** Generate kode 6 digit random. */
  private generateCode(): string {
    // 100000–999999 inklusif
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
  }

  /**
   * Request kode OTP baru.
   * Throw jika:
   *   - WA belum aktif / belum connected.
   *   - Cooldown belum lewat.
   *   - Nomor tidak terdaftar di WhatsApp (kalau cek aktif).
   */
  async requestOtp(input: RequestOtpInput): Promise<{ ttlSec: number }> {
    logger.info("otp.request.start", {
      phone: input.phone,
      purpose: input.purpose,
    });
    const cfg = await settingsService.getWaConfig();
    logger.info("otp.request.cfg", {
      enabled: cfg.enabled,
      featureOtpRegister: cfg.featureOtpRegister,
      featureOtpReset: cfg.featureOtpReset,
      waReady: waService.isReady(),
      waStatus: waService.getState().status,
    });
    if (!cfg.enabled) {
      throw Errors.badRequest(
        "Verifikasi WhatsApp sedang tidak aktif. Hubungi admin.",
      );
    }
    if (!waService.isReady()) {
      throw Errors.badRequest(
        "Layanan WhatsApp sedang tidak tersedia. Coba lagi nanti.",
      );
    }

    // cek fitur per-purpose
    if (
      input.purpose === OtpPurpose.REGISTER &&
      !cfg.featureOtpRegister
    ) {
      throw Errors.badRequest(
        "Pendaftaran via OTP WhatsApp tidak aktif.",
      );
    }
    if (
      input.purpose === OtpPurpose.RESET_PASSWORD &&
      !cfg.featureOtpReset
    ) {
      throw Errors.badRequest(
        "Reset password via OTP WhatsApp tidak aktif.",
      );
    }
    if (
      input.purpose === OtpPurpose.LOGIN &&
      !cfg.featureOtpLogin
    ) {
      throw Errors.badRequest(
        "Login via OTP WhatsApp tidak aktif.",
      );
    }

    // cooldown check
    const lastActive = await prisma.otpCode.findFirst({
      where: {
        phone: input.phone,
        purpose: input.purpose,
      },
      orderBy: { createdAt: "desc" },
    });
    if (lastActive) {
      const diffSec = (Date.now() - lastActive.createdAt.getTime()) / 1000;
      if (diffSec < cfg.otpResendCooldownSec) {
        const sisa = Math.ceil(cfg.otpResendCooldownSec - diffSec);
        throw Errors.rateLimited(
          `Tunggu ${sisa} detik sebelum minta kode baru.`,
        );
      }
    }

    // verifikasi nomor terdaftar di WA (best effort — kalau gagal cek, lanjut)
    const onWa = await waService.isOnWhatsApp(input.phone);
    logger.info("otp.request.onWaCheck", { phone: input.phone, onWa });
    if (!onWa) {
      throw Errors.badRequest(
        "Nomor tidak terdaftar di WhatsApp. Periksa kembali nomor Anda.",
      );
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + cfg.otpTtlSec * 1000);

    // invalidate semua active OTP utk (phone, purpose), lalu insert baru
    await prisma.$transaction([
      prisma.otpCode.updateMany({
        where: {
          phone: input.phone,
          purpose: input.purpose,
          status: OtpStatus.ACTIVE,
        },
        data: { status: OtpStatus.EXPIRED },
      }),
      prisma.otpCode.create({
        data: {
          phone: input.phone,
          purpose: input.purpose,
          codeHash,
          expiresAt,
          ipAddress: input.ip ?? null,
        },
      }),
    ]);

    // build & send message
    const branding = await settingsService.getSiteBranding();
    let tpl: string;
    if (input.purpose === OtpPurpose.REGISTER) tpl = cfg.tplOtpRegister;
    else if (input.purpose === OtpPurpose.RESET_PASSWORD) tpl = cfg.tplOtpReset;
    else if (input.purpose === OtpPurpose.LOGIN) tpl = cfg.tplOtpLogin;
    else tpl = cfg.tplOtpRegister; // fallback (PHONE_VERIFY pakai template register)
    const text = waService.applyTemplate(tpl, {
      site: branding.name,
      kode: code,
      ttl_menit: String(Math.ceil(cfg.otpTtlSec / 60)),
    });

    try {
      logger.info("otp.request.sending", {
        phone: input.phone,
        textLen: text.length,
      });
      await waService.sendText(input.phone, text);
      logger.info("otp.request.sent", { phone: input.phone });
    } catch (err) {
      logger.error("otp.send.failed", {
        phone: input.phone,
        purpose: input.purpose,
        err: String(err),
      });
      // gagal kirim → tandai OTP-nya EXPIRED supaya user bisa request ulang
      // tanpa nunggu cooldown panjang.
      await prisma.otpCode.updateMany({
        where: {
          phone: input.phone,
          purpose: input.purpose,
          status: OtpStatus.ACTIVE,
        },
        data: { status: OtpStatus.EXPIRED },
      });
      throw Errors.badRequest(
        "Gagal mengirim OTP via WhatsApp. Pastikan nomor benar dan coba lagi.",
      );
    }

    logger.info("otp.requested", {
      phone: input.phone,
      purpose: input.purpose,
    });

    return { ttlSec: cfg.otpTtlSec };
  }

  /**
   * Verifikasi kode OTP. Tidak menghapus row — set status USED untuk audit.
   * Mengembalikan true kalau cocok.
   *
   * Throw kalau:
   *   - Tidak ada OTP aktif → `Errors.badRequest`
   *   - Sudah expired → `Errors.badRequest`
   *   - Salah ketik → `Errors.badRequest` (counter naik)
   *   - Salah ketik melebihi max → `Errors.badRequest` ("OTP terkunci")
   */
  async verifyOtp(input: VerifyOtpInput): Promise<void> {
    const cfg = await settingsService.getWaConfig();

    const otp = await prisma.otpCode.findFirst({
      where: {
        phone: input.phone,
        purpose: input.purpose,
        status: OtpStatus.ACTIVE,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      throw Errors.badRequest(
        "Tidak ada kode OTP aktif. Silakan minta kode baru.",
      );
    }
    if (otp.expiresAt < new Date()) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { status: OtpStatus.EXPIRED },
      });
      throw Errors.badRequest(
        "Kode OTP sudah kadaluarsa. Silakan minta kode baru.",
      );
    }

    const ok = await bcrypt.compare(input.code, otp.codeHash);
    if (!ok) {
      const newAttempt = otp.attempt + 1;
      const exhausted = newAttempt >= cfg.otpMaxAttempt;
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: {
          attempt: newAttempt,
          status: exhausted ? OtpStatus.EXPIRED : OtpStatus.ACTIVE,
        },
      });
      if (exhausted) {
        throw Errors.badRequest(
          "Kode OTP salah terlalu banyak. Silakan minta kode baru.",
        );
      }
      const sisa = cfg.otpMaxAttempt - newAttempt;
      throw Errors.badRequest(
        `Kode OTP salah. Sisa percobaan: ${sisa}.`,
      );
    }

    // sukses → mark USED
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        status: OtpStatus.USED,
        consumedAt: new Date(),
      },
    });

    logger.info("otp.verified", {
      phone: input.phone,
      purpose: input.purpose,
    });
  }

  /** Cleanup OTP lama (cron-able). */
  async cleanupOldOtp(beforeMs = 24 * 3600_000): Promise<number> {
    const before = new Date(Date.now() - beforeMs);
    const res = await prisma.otpCode.deleteMany({
      where: {
        status: { in: [OtpStatus.USED, OtpStatus.EXPIRED] },
        createdAt: { lt: before },
      } satisfies Prisma.OtpCodeWhereInput,
    });
    return res.count;
  }
}

export const otpService = new OtpService();
