/**
 * Auth Service — register, login, session token.
 * Pakai iron-session + bcrypt. Token disimpan juga di tabel `sessions`
 * agar bisa di-revoke.
 */
import { Prisma, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import type {
  LoginInput,
  RegisterInput,
  RegisterOtpVerifyInput,
  ForgotPasswordVerifyInput,
} from "@/schemas/auth.schema";

const SESSION_TTL_DAYS = 7;

export const authService = {
  async register(input: RegisterInput): Promise<User> {
    const exists = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
    });
    if (exists) {
      throw Errors.conflict("Email atau username sudah dipakai.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    return prisma.$transaction(async (db) => {
      const user = await db.user.create({
        data: {
          email: input.email,
          username: input.username,
          phone: input.phone,
          fullName: input.fullName,
          passwordHash,
          balance: { create: { amount: 0 } },
        },
      });
      return user;
    });
  },

  async login(input: LoginInput): Promise<{ user: User; token: string; expiresAt: Date }> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.identifier }, { username: input.identifier }],
      },
    });

    // Selalu lakukan bcrypt.compare() walau user gak ada — cegah timing attack
    // (waktu response konsisten, attacker gak bisa enumerate user dari latency)
    const dummyHash = "$2a$12$abcdefghijklmnopqrstuv0123456789012345678901234567890";
    const ok = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? dummyHash,
    );

    // Generic error untuk SEMUA case (user gak ada, password salah, akun nonaktif).
    // Cegah user enumeration & status leak.
    if (!user || !ok || user.status !== "ACTIVE") {
      throw Errors.unauthorized("Email/username atau password salah.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

    await prisma.$transaction([
      prisma.session.create({
        data: { userId: user.id, token, expiresAt },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return { user, token, expiresAt };
  },

  async logout(token: string) {
    await prisma.session.deleteMany({ where: { token } });
  },

  async getUserByToken(token: string) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { balance: true } } },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return session.user;
  },

  /**
   * Register dengan OTP — dipanggil setelah verifyOtp() sukses.
   * Caller WAJIB sudah memvalidasi kode OTP via otpService.verifyOtp().
   * Set phone_verified karena memang baru saja terverifikasi.
   */
  async registerWithOtp(input: RegisterOtpVerifyInput): Promise<User> {
    const phoneE164 = normalizePhone(input.phone);
    if (!phoneE164) {
      throw Errors.badRequest("Nomor HP tidak valid.");
    }

    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { email: input.email },
          { username: input.username },
          { phone: phoneE164 },
        ],
      },
    });
    if (exists) {
      // jangan bocorkan field mana yang bentrok
      throw Errors.conflict(
        "Email, username, atau nomor HP sudah dipakai.",
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    return prisma.$transaction(async (db) => {
      const user = await db.user.create({
        data: {
          email: input.email,
          username: input.username,
          phone: phoneE164,
          fullName: input.fullName,
          passwordHash,
          phoneVerified: new Date(),
          balance: { create: { amount: 0 } },
        },
      });
      return user;
    });
  },

  /**
   * Reset password setelah OTP terverifikasi. Phone-nya WAJIB sudah ada
   * pemiliknya (sudah di-resolve ke User di endpoint).
   */
  async resetPasswordWithOtp(
    input: ForgotPasswordVerifyInput,
  ): Promise<void> {
    const phoneE164 = normalizePhone(input.phone);
    if (!phoneE164) {
      throw Errors.badRequest("Nomor HP tidak valid.");
    }
    const user = await prisma.user.findUnique({
      where: { phone: phoneE164 },
    });
    if (!user) {
      // generic error untuk cegah enumeration
      throw Errors.badRequest("Nomor HP tidak terdaftar.");
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      // revoke semua session aktif → user harus login ulang
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
  },

  /**
   * Resolve identifier (email / username / phone) ke nomor HP terverifikasi.
   * Return null kalau tidak ketemu / phone belum di-set.
   * Dipakai forgot-password step 1.
   */
  async resolvePhoneFromIdentifier(
    identifier: string,
  ): Promise<string | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    // coba sebagai phone dulu
    const phoneE164 = normalizePhone(trimmed);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: trimmed },
          { username: trimmed },
          phoneE164 ? { phone: phoneE164 } : { phone: "__never__" },
        ],
      },
      select: { phone: true },
    });
    return user?.phone ?? null;
  },

  /**
   * Validasi kredensial tanpa bikin session — dipakai di login step 1
   * (request OTP). Selalu pakai bcrypt.compare bahkan kalau user gak ada
   * untuk cegah timing attack. Throw generic error.
   *
   * Return user (lengkap dengan phone) kalau valid.
   */
  async verifyCredentialsForLogin(input: LoginInput): Promise<User> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.identifier }, { username: input.identifier }],
      },
    });
    const dummyHash =
      "$2a$12$abcdefghijklmnopqrstuv0123456789012345678901234567890";
    const ok = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? dummyHash,
    );
    if (!user || !ok || user.status !== "ACTIVE") {
      throw Errors.unauthorized("Email/username atau password salah.");
    }
    return user;
  },

  /**
   * Login step 2 — bikin session setelah OTP terverifikasi.
   * Caller WAJIB sudah memvalidasi OTP via otpService.verifyOtp().
   * `phone` dipakai untuk lookup user (cegah race kalau user ganti phone
   * di antara step 1 dan step 2).
   */
  async loginWithOtp(
    phone: string,
  ): Promise<{ user: User; token: string; expiresAt: Date }> {
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164) {
      throw Errors.badRequest("Nomor HP tidak valid.");
    }
    const user = await prisma.user.findUnique({
      where: { phone: phoneE164 },
    });
    if (!user || user.status !== "ACTIVE") {
      throw Errors.unauthorized("Akun tidak ditemukan atau dinonaktifkan.");
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
    await prisma.$transaction([
      prisma.session.create({
        data: { userId: user.id, token, expiresAt },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);
    return { user, token, expiresAt };
  },
};
