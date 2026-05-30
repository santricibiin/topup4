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
import type { LoginInput, RegisterInput } from "@/schemas/auth.schema";

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
};
