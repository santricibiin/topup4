/**
 * Ticket Service — sistem support antara user dan admin.
 *
 * Storage attachment: di luar folder public/.
 *   data/uploads/tickets/<ticketId>/<random>.<ext>
 * Akses lewat API authenticated, JANGAN expose path.
 *
 * State machine:
 *   OPEN → AWAITING_ADMIN (auto saat user buat tiket pertama)
 *   AWAITING_ADMIN → AWAITING_USER (admin reply)
 *   AWAITING_USER → AWAITING_ADMIN (user reply)
 *   AWAITING_* → RESOLVED (admin tandai selesai)
 *   RESOLVED → AWAITING_ADMIN (user reply = reopen)
 *   any → CLOSED (admin close, user tidak bisa balas)
 */
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  TicketStatus,
  TicketCategory,
  TicketPriority,
  TicketAuthorType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Errors } from "@/lib/errors";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads", "tickets");
export const TICKET_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const TICKET_MAX_FILES_PER_MESSAGE = 5;
export const TICKET_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function todayCode() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function randomSuffix(n = 4) {
  return crypto
    .randomBytes(Math.ceil(n / 2))
    .toString("hex")
    .slice(0, n)
    .toUpperCase();
}

function safeExt(mime: string, original: string): string {
  // Mapping mime → ext yang aman.
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  if (map[mime]) return map[mime]!;
  // Fallback: pakai ext dari original tapi hanya alfanumerik 1-5 char.
  const ext = path.extname(original).slice(1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
}

export interface TicketFileInput {
  buffer: Buffer;
  mimeType: string;
  size: number;
  originalName: string;
}

class TicketService {
  /** Helper buat tiket baru + pesan pertama (atomic). */
  async createTicket(params: {
    userId: string;
    subject: string;
    body: string;
    category?: TicketCategory;
    relatedOrderId?: string | null;
    relatedDepositId?: string | null;
    files?: TicketFileInput[];
  }) {
    const subject = params.subject.trim();
    const body = params.body.trim();
    if (!subject || subject.length > 160) {
      throw Errors.badRequest("Subjek wajib diisi (maks 160 karakter).");
    }
    if (!body) throw Errors.badRequest("Pesan tidak boleh kosong.");
    if (body.length > 5000) {
      throw Errors.badRequest("Pesan terlalu panjang (maks 5000 karakter).");
    }

    this.validateFiles(params.files);

    // Generate nomor tiket: TKT-YYYYMMDD-XXXX. Retry max 3x kalau collision.
    let ticketNumber = "";
    for (let i = 0; i < 3; i++) {
      const candidate = `TKT-${todayCode()}-${randomSuffix(4)}`;
      const exists = await prisma.ticket.findUnique({
        where: { ticketNumber: candidate },
        select: { id: true },
      });
      if (!exists) {
        ticketNumber = candidate;
        break;
      }
    }
    if (!ticketNumber) {
      ticketNumber = `TKT-${todayCode()}-${randomSuffix(6)}`;
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: {
          ticketNumber,
          userId: params.userId,
          subject,
          category: params.category ?? TicketCategory.GENERAL,
          status: TicketStatus.AWAITING_ADMIN,
          relatedOrderId: params.relatedOrderId ?? null,
          relatedDepositId: params.relatedDepositId ?? null,
          lastMessageAt: new Date(),
          userLastReadAt: new Date(),
        },
      });
      const msg = await tx.ticketMessage.create({
        data: {
          ticketId: t.id,
          authorType: TicketAuthorType.USER,
          authorId: params.userId,
          body,
          isInternal: false,
        },
      });
      if (params.files && params.files.length) {
        await this.persistAttachments(tx, t.id, msg.id, params.files);
      }
      return t;
    });

    logger.info("ticket.create", {
      id: ticket.id,
      number: ticket.ticketNumber,
      userId: params.userId,
    });

    return ticket;
  }

  /** Tambah pesan balasan. authorType menentukan transisi status. */
  async addMessage(params: {
    ticketId: string;
    authorType: TicketAuthorType;
    authorId: string;
    body: string;
    isInternal?: boolean;
    files?: TicketFileInput[];
  }) {
    const body = params.body.trim();
    if (!body) throw Errors.badRequest("Pesan tidak boleh kosong.");
    if (body.length > 5000) {
      throw Errors.badRequest("Pesan terlalu panjang (maks 5000 karakter).");
    }
    this.validateFiles(params.files);

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
    });
    if (!ticket) throw Errors.notFound("Tiket tidak ditemukan.");

    // CLOSED: tidak boleh balas siapa pun (kecuali system).
    if (
      ticket.status === TicketStatus.CLOSED &&
      params.authorType !== TicketAuthorType.SYSTEM
    ) {
      throw Errors.badRequest(
        "Tiket sudah ditutup. Buat tiket baru untuk masalah lain.",
      );
    }

    // Tentukan status berikutnya.
    let nextStatus: TicketStatus = ticket.status;
    let resolvedAt: Date | null = ticket.resolvedAt;
    if (!params.isInternal) {
      if (params.authorType === TicketAuthorType.USER) {
        // User reply selalu kirim ke admin (termasuk reopen dari RESOLVED).
        nextStatus = TicketStatus.AWAITING_ADMIN;
        if (ticket.status === TicketStatus.RESOLVED) {
          resolvedAt = null; // reopened
        }
      } else if (params.authorType === TicketAuthorType.ADMIN) {
        nextStatus = TicketStatus.AWAITING_USER;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const msg = await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: params.authorType,
          authorId: params.authorId,
          body,
          isInternal: params.isInternal ?? false,
        },
      });
      if (params.files && params.files.length) {
        await this.persistAttachments(tx, ticket.id, msg.id, params.files);
      }

      // Internal note: tidak bump lastMessageAt, tidak ubah status.
      const update: Prisma.TicketUpdateInput = params.isInternal
        ? {}
        : {
            status: nextStatus,
            lastMessageAt: new Date(),
            resolvedAt,
            // Yang barusan kirim = otomatis sudah baca.
            ...(params.authorType === TicketAuthorType.USER
              ? { userLastReadAt: new Date() }
              : params.authorType === TicketAuthorType.ADMIN
                ? { adminLastReadAt: new Date() }
                : {}),
          };
      if (Object.keys(update).length) {
        await tx.ticket.update({ where: { id: ticket.id }, data: update });
      }
      return msg;
    });

    return result;
  }

  /** Update status (resolve / close / reopen) — hanya admin. */
  async setStatus(params: {
    ticketId: string;
    status: TicketStatus;
    adminId: string;
  }) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
    });
    if (!ticket) throw Errors.notFound("Tiket tidak ditemukan.");

    const data: Prisma.TicketUpdateInput = {
      status: params.status,
      adminLastReadAt: new Date(),
    };
    if (params.status === TicketStatus.RESOLVED) {
      data.resolvedAt = new Date();
      data.closedAt = null;
    } else if (params.status === TicketStatus.CLOSED) {
      data.closedAt = new Date();
      if (!ticket.resolvedAt) data.resolvedAt = new Date();
    } else if (
      params.status === TicketStatus.AWAITING_ADMIN ||
      params.status === TicketStatus.AWAITING_USER ||
      params.status === TicketStatus.OPEN
    ) {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticket.id }, data });
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: TicketAuthorType.SYSTEM,
          authorId: null,
          body: `Status diubah ke ${params.status} oleh admin.`,
          isInternal: false,
        },
      });
    });
  }

  /** Update meta: priority & assignedAdmin. */
  async setMeta(params: {
    ticketId: string;
    priority?: TicketPriority;
    assignedAdminId?: string | null;
  }) {
    const data: Prisma.TicketUpdateInput = {};
    if (params.priority) data.priority = params.priority;
    if (params.assignedAdminId !== undefined) {
      data.assignedAdmin =
        params.assignedAdminId === null
          ? { disconnect: true }
          : { connect: { id: params.assignedAdminId } };
    }
    if (!Object.keys(data).length) return;
    await prisma.ticket.update({ where: { id: params.ticketId }, data });
  }

  async markRead(params: {
    ticketId: string;
    side: "USER" | "ADMIN";
  }) {
    const data =
      params.side === "USER"
        ? { userLastReadAt: new Date() }
        : { adminLastReadAt: new Date() };
    await prisma.ticket.update({ where: { id: params.ticketId }, data });
  }

  /** List tiket milik user (paged). */
  async listForUser(userId: string, opts: { status?: TicketStatus; take?: number } = {}) {
    return prisma.ticket.findMany({
      where: { userId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ lastMessageAt: "desc" }],
      take: opts.take ?? 50,
    });
  }

  /** List tiket utk admin dengan filter. */
  async listForAdmin(opts: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assignedAdminId?: string | null;
    search?: string;
    take?: number;
  } = {}) {
    const where: Prisma.TicketWhereInput = {};
    if (opts.status) where.status = opts.status;
    if (opts.priority) where.priority = opts.priority;
    if (opts.category) where.category = opts.category;
    if (opts.assignedAdminId === null) where.assignedAdminId = null;
    else if (opts.assignedAdminId) where.assignedAdminId = opts.assignedAdminId;
    if (opts.search) {
      where.OR = [
        { subject: { contains: opts.search } },
        { ticketNumber: { contains: opts.search } },
        { user: { email: { contains: opts.search } } },
        { user: { username: { contains: opts.search } } },
      ];
    }
    return prisma.ticket.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }],
      take: opts.take ?? 100,
      include: {
        user: { select: { id: true, username: true, email: true, fullName: true } },
        assignedAdmin: { select: { id: true, username: true } },
      },
    });
  }

  /** Ambil thread (ticket + messages). includeInternal=true → admin only. */
  async getThread(params: { ticketId: string; includeInternal: boolean }) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
      include: {
        user: { select: { id: true, username: true, email: true, fullName: true, avatarUrl: true } },
        assignedAdmin: { select: { id: true, username: true } },
      },
    });
    if (!ticket) return null;

    const messages = await prisma.ticketMessage.findMany({
      where: {
        ticketId: ticket.id,
        ...(params.includeInternal ? {} : { isInternal: false }),
      },
      orderBy: [{ createdAt: "asc" }],
      include: { attachments: true },
    });
    return { ticket, messages };
  }

  /** Untuk badge unread di navbar. */
  async countUnreadForUser(userId: string): Promise<number> {
    // Prisma belum support compare 2 kolom langsung; lakukan manual.
    const tickets = await prisma.ticket.findMany({
      where: {
        userId,
        status: TicketStatus.AWAITING_USER, // hanya yg bola di user
      },
      select: { lastMessageAt: true, userLastReadAt: true },
    });
    return tickets.filter(
      (t) => !t.userLastReadAt || t.lastMessageAt > t.userLastReadAt,
    ).length;
  }

  /** Untuk badge admin sidebar. */
  async countOpenForAdmin(): Promise<number> {
    return prisma.ticket.count({
      where: {
        status: { in: [TicketStatus.OPEN, TicketStatus.AWAITING_ADMIN] },
      },
    });
  }

  // ================== ATTACHMENT HELPERS ==================

  /** Resolve full disk path dari storageKey. */
  resolveStoragePath(storageKey: string): string {
    // Cegah path traversal & absolute path.
    const normalized = storageKey.replace(/\\/g, "/");
    if (
      normalized.includes("..") ||
      normalized.startsWith("/") ||
      path.isAbsolute(normalized)
    ) {
      throw Errors.badRequest("Storage key tidak valid.");
    }
    const full = path.resolve(UPLOAD_ROOT, normalized);
    // Pastikan masih di dalam UPLOAD_ROOT.
    if (!full.startsWith(path.resolve(UPLOAD_ROOT))) {
      throw Errors.badRequest("Storage key di luar folder upload.");
    }
    return full;
  }

  async readAttachment(attachmentId: string) {
    const att = await prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: { include: { ticket: true } } },
    });
    if (!att) return null;
    return att;
  }

  async readAttachmentFile(att: { storageKey: string }) {
    const fullPath = this.resolveStoragePath(att.storageKey);
    return fs.readFile(fullPath);
  }

  validateFiles(files?: TicketFileInput[]) {
    if (!files || !files.length) return;
    if (files.length > TICKET_MAX_FILES_PER_MESSAGE) {
      throw Errors.badRequest(
        `Maksimal ${TICKET_MAX_FILES_PER_MESSAGE} file per pesan.`,
      );
    }
    for (const f of files) {
      if (!TICKET_ALLOWED_MIME.has(f.mimeType)) {
        throw Errors.badRequest(
          `Tipe file ${f.mimeType} tidak diizinkan. Gunakan PNG/JPG/WEBP/GIF/PDF.`,
        );
      }
      if (f.size > TICKET_MAX_FILE_BYTES) {
        throw Errors.badRequest("Ukuran file maksimal 5 MB.");
      }
    }
  }

  /** Tulis files ke disk + insert row attachment. */
  async persistAttachments(
    tx: Prisma.TransactionClient,
    ticketId: string,
    messageId: string,
    files: TicketFileInput[],
  ) {
    const dir = path.join(UPLOAD_ROOT, ticketId);
    await fs.mkdir(dir, { recursive: true });
    for (const f of files) {
      const ext = safeExt(f.mimeType, f.originalName);
      const fileName = `${randomSuffix(8)}.${ext}`;
      const fullPath = path.join(dir, fileName);
      await fs.writeFile(fullPath, f.buffer);
      await tx.ticketAttachment.create({
        data: {
          messageId,
          storageKey: `${ticketId}/${fileName}`,
          originalName: f.originalName.slice(0, 250),
          mimeType: f.mimeType,
          size: f.size,
        },
      });
    }
  }
}

export const ticketService = new TicketService();
