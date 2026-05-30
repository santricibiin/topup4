/**
 * BackupService — manage MySQL database backup & uploads folder backup.
 *
 * Operations DB:
 *   - dump()       → pakai `mysqldump` ke file .sql.gz
 *   - restore()    → import dari .sql atau .sql.gz (drop tables + import)
 *
 * Operations UPLOADS:
 *   - dumpUploads()    → tar.gz seluruh isi data/uploads/
 *   - restoreUploads() → extract tar.gz ke data/uploads/ (auto pre-backup)
 *
 * Operations umum:
 *   - list()       → list semua backup files (db + uploads)
 *   - delete()     → hapus 1 file backup
 *   - cleanup()    → auto-delete file > keepDays (rotation)
 *   - saveUpload() → terima file upload dari admin UI (.sql/.sql.gz/.tar.gz)
 *   - parseDbUrl() → extract host/user/pass/db dari DATABASE_URL
 *
 * Lokasi file:
 *   <APP_ROOT>/backups/ptopup-YYYYMMDD-HHmmss.sql.gz         (DB dump)
 *   <APP_ROOT>/backups/ptopup-uploads-YYYYMMDD-HHmmss.tar.gz (data/ bundle: uploads + wa-session)
 * Folder dibikin auto kalau belum ada.
 */
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs, createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

export type BackupKind = "db" | "uploads";

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  sizeText: string;
  createdAt: Date;
  compressed: boolean;
  /** Tipe konten: dump database atau bundle folder uploads. */
  kind: BackupKind;
}

export interface DbConnInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

class BackupService {
  /** Folder utama backup. Default: <cwd>/backups */
  private readonly backupDir: string;
  /** Root project (<cwd>) — referensi untuk tar uploads. */
  private readonly appRoot: string;
  /** Folder media yang dibundle saat backup uploads. Relatif ke appRoot. */
  private readonly uploadsRel = path.join("data", "uploads");
  /** Folder sesi WhatsApp (Baileys creds + keys). Relatif ke appRoot. */
  private readonly waSessionRel = path.join("data", "wa-session");

  constructor() {
    this.appRoot = process.cwd();
    this.backupDir = path.join(this.appRoot, "backups");
  }

  /** Path absolut folder uploads. */
  private uploadsAbs(): string {
    return path.join(this.appRoot, this.uploadsRel);
  }

  /** Path absolut folder wa-session. */
  private waSessionAbs(): string {
    return path.join(this.appRoot, this.waSessionRel);
  }

  /**
   * List folder relatif yang harus masuk ke bundle.
   * Skip folder yang belum ada (mis. wa-session belum pernah dipakai).
   */
  private async resolveBundleTargets(): Promise<string[]> {
    const candidates: Array<{ rel: string; abs: string }> = [
      { rel: this.uploadsRel, abs: this.uploadsAbs() },
      { rel: this.waSessionRel, abs: this.waSessionAbs() },
    ];
    const targets: string[] = [];
    for (const c of candidates) {
      try {
        const st = await fs.stat(c.abs);
        if (st.isDirectory()) targets.push(c.rel);
      } catch {
        // folder belum ada — skip
      }
    }
    return targets;
  }

  /**
   * Build env untuk spawn `mysql`/`mysqldump`.
   * Set `MYSQL_PWD` HANYA kalau password non-empty supaya client gak bingung
   * dan tetap pakai mode "tanpa password" di local dev.
   */
  private buildMysqlEnv(password: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (password) {
      env.MYSQL_PWD = password;
    } else {
      delete env.MYSQL_PWD;
    }
    return env;
  }

  /**
   * Wrap child process supaya error spawn (ENOENT, EACCES, dll) tidak naik
   * jadi `uncaughtException`. Race antara event `close` dan `error`.
   *
   * Return exit code (number) atau throw Error dengan pesan ramah.
   */
  private waitForExit(
    proc: ChildProcess,
    cmdName: string,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let settled = false;
      proc.once("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        if (err.code === "ENOENT") {
          reject(
            new Error(
              `Command '${cmdName}' tidak ditemukan di PATH. ` +
                `Pastikan ${cmdName} terinstal dan tersedia di PATH server.`,
            ),
          );
        } else {
          reject(
            new Error(
              `Gagal menjalankan '${cmdName}': ${err.message ?? String(err)}`,
            ),
          );
        }
      });
      proc.once("close", (code) => {
        if (settled) return;
        settled = true;
        resolve(code ?? 1);
      });
    });
  }

  /** Tentukan kind dari nama file. */
  private detectKind(name: string): BackupKind {
    return /\.(tar\.gz|tgz)$/i.test(name) ? "uploads" : "db";
  }

  /** Parse DATABASE_URL jadi connection components. */
  parseDbUrl(): DbConnInfo {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tidak di-set");

    // Pakai URL class — lebih toleran daripada regex.
    // Mendukung password kosong, port opsional, query params, percent-encoded chars.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        "DATABASE_URL format invalid (bukan URL yang bisa di-parse)",
      );
    }

    // Prisma support: mysql://, mysql+srv:// (jarang)
    if (!parsed.protocol.startsWith("mysql")) {
      throw new Error(
        `DATABASE_URL harus mysql:// (sekarang: ${parsed.protocol})`,
      );
    }

    // pathname biasanya "/dbname" atau "/dbname?param=..."
    const dbRaw = parsed.pathname.replace(/^\//, "").split("?")[0] ?? "";
    const database = decodeURIComponent(dbRaw);
    if (!database) {
      throw new Error("DATABASE_URL tidak menyertakan nama database");
    }

    if (!parsed.hostname) {
      throw new Error("DATABASE_URL tidak menyertakan host");
    }

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database,
    };
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  /**
   * Dump database ke file .sql.gz.
   * Streaming langsung dari mysqldump → gzip → file (memory-efficient).
   */
  async dump(): Promise<BackupFile> {
    await this.ensureDir();
    const conn = this.parseDbUrl();

    const ts = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .replace(/\..*$/, "");
    const filename = `ptopup-${ts}.sql.gz`;
    const filepath = path.join(this.backupDir, filename);

    // Pakai mysqldump command (asumsi installed di server)
    // Perlu spawn (bukan execFile) supaya bisa pipe stream.
    // SECURITY: pass password via MYSQL_PWD env var (BUKAN -p flag)
    // supaya gak ke-leak di output `ps aux`. Kalau password kosong (local dev),
    // helper skip env var supaya client gak prompt.
    const { spawn } = await import("node:child_process");
    const mysqlEnv = this.buildMysqlEnv(conn.password);
    const dumpProc = spawn(
      "mysqldump",
      [
        `-h${conn.host}`,
        `-P${conn.port}`,
        `-u${conn.user}`,
        "--single-transaction",
        "--routines",
        "--triggers",
        "--skip-lock-tables",
        "--quick",
        "--set-gtid-purged=OFF",
        conn.database,
      ],
      { stdio: ["ignore", "pipe", "pipe"], env: mysqlEnv },
    );

    // Wait promise dipasang dulu — biar `error` event ENOENT/dll
    // ketangkep di sini, gak naik jadi uncaughtException.
    const exitPromise = this.waitForExit(dumpProc, "mysqldump");

    const errChunks: Buffer[] = [];
    dumpProc.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));
    dumpProc.stderr?.on("error", () => {});
    dumpProc.stdout?.on("error", () => {});

    const writeStream = createWriteStream(filepath);
    const gzip = createGzip({ level: 9 });

    let pipelineErr: unknown = null;
    try {
      await pipeline(dumpProc.stdout!, gzip, writeStream);
    } catch (err) {
      pipelineErr = err;
    }

    // exitPromise akan reject kalau spawn error (ENOENT). Itu prioritas pesan.
    let exitCode: number;
    try {
      exitCode = await exitPromise;
    } catch (spawnErr) {
      await fs.unlink(filepath).catch(() => {});
      throw spawnErr;
    }

    if (pipelineErr) {
      await fs.unlink(filepath).catch(() => {});
      const errMsg = Buffer.concat(errChunks).toString();
      throw new Error(
        `mysqldump pipeline gagal: ${errMsg || (pipelineErr as Error).message}`,
      );
    }

    if (exitCode !== 0) {
      await fs.unlink(filepath).catch(() => {});
      const errMsg = Buffer.concat(errChunks).toString();
      throw new Error(`mysqldump exit code ${exitCode}: ${errMsg}`);
    }

    const stat = await fs.stat(filepath);
    if (stat.size < 100) {
      await fs.unlink(filepath).catch(() => {});
      throw new Error("Backup file too small (< 100 bytes), likely failed");
    }

    logger.info("backup.created", {
      filename,
      size: stat.size,
    });

    return {
      name: filename,
      path: filepath,
      size: stat.size,
      sizeText: this.formatBytes(stat.size),
      createdAt: stat.birthtime,
      compressed: true,
      kind: "db",
    };
  }

  /**
   * Bundle folder `data/uploads/` dan `data/wa-session/` jadi `.tar.gz`.
   * Pakai `tar` system command (Linux/macOS/WSL/Git Bash) untuk efisiensi
   * dan kompatibilitas dengan script `db-restore.sh`.
   *
   * Format file: ptopup-uploads-YYYYMMDD-HHmmss.tar.gz
   * Bundle root: relatif ke <appRoot>, isi diawali `data/uploads/` dan/atau
   * `data/wa-session/` (folder yang belum ada di-skip otomatis).
   */
  async dumpUploads(): Promise<BackupFile> {
    await this.ensureDir();
    const uploadsDir = this.uploadsAbs();

    // Pastikan folder uploads ada (bikin kosong supaya tar gak error kalau
    // wa-session juga belum ada).
    await fs.mkdir(uploadsDir, { recursive: true });

    const targets = await this.resolveBundleTargets();
    if (targets.length === 0) {
      // Fallback: tetap bundle uploads (folder kosong) supaya restore aman.
      targets.push(this.uploadsRel);
    }

    const ts = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .replace(/\..*$/, "");
    const filename = `ptopup-uploads-${ts}.tar.gz`;
    const filepath = path.join(this.backupDir, filename);

    const { spawn } = await import("node:child_process");
    // tar -czf <out> -C <appRoot> data/uploads [data/wa-session]
    const tarProc = spawn(
      "tar",
      ["-czf", filepath, "-C", this.appRoot, ...targets],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const errChunks: Buffer[] = [];
    tarProc.stderr?.on("data", (c: Buffer) => errChunks.push(c));
    tarProc.stderr?.on("error", () => {});

    const exitCode = await this.waitForExit(tarProc, "tar");

    if (exitCode !== 0) {
      await fs.unlink(filepath).catch(() => {});
      const errMsg = Buffer.concat(errChunks).toString();
      throw new Error(`tar exit code ${exitCode}: ${errMsg}`);
    }

    const stat = await fs.stat(filepath);
    if (stat.size < 50) {
      await fs.unlink(filepath).catch(() => {});
      throw new Error("Bundle uploads terlalu kecil (< 50 byte), kemungkinan gagal");
    }

    logger.info("backup.uploads.created", {
      filename,
      size: stat.size,
      targets,
    });

    return {
      name: filename,
      path: filepath,
      size: stat.size,
      sizeText: this.formatBytes(stat.size),
      createdAt: stat.birthtime,
      compressed: true,
      kind: "uploads",
    };
  }

  /**
   * Restore folder uploads dari file `.tar.gz`.
   *
   * Langkah:
   *  1. Validasi file ada & extension cocok.
   *  2. Pre-backup folder uploads sekarang ke
   *     `<backupDir>/pre-restore-uploads-YYYYMMDD-HHmmss.tar.gz` (auto-rollback bahan).
   *  3. Hapus seluruh isi folder data/uploads/.
   *  4. Extract bundle ke <appRoot> (entri di tar berbentuk `data/uploads/...`).
   *
   * Source bisa absolute path atau filename relatif ke backupDir.
   */
  async restoreUploads(
    source: string,
  ): Promise<{ files: number; preRestoreBackup: string | null }> {
    const resolvedPath = path.isAbsolute(source)
      ? source
      : path.join(this.backupDir, path.basename(source));

    const realPath = await fs.realpath(resolvedPath).catch(() => null);
    if (!realPath) throw new Error("Bundle uploads tidak ditemukan");

    if (!/\.(tar\.gz|tgz)$/i.test(realPath)) {
      throw new Error("File harus berekstensi .tar.gz atau .tgz");
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) throw new Error("Source bukan file");

    logger.info("backup.uploads.restore.start", {
      source: path.basename(realPath),
    });

    const { spawn } = await import("node:child_process");

    // 1. Pre-backup folder uploads saat ini (rollback safety net).
    let preRestoreBackup: string | null = null;
    const uploadsDir = this.uploadsAbs();
    try {
      await fs.access(uploadsDir);
      const ts = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .replace(/\..*$/, "");
      const preName = `pre-restore-uploads-${ts}.tar.gz`;
      const prePath = path.join(this.backupDir, preName);
      await this.ensureDir();
      const preTargets = await this.resolveBundleTargets();
      if (preTargets.length === 0) preTargets.push(this.uploadsRel);
      const preProc = spawn(
        "tar",
        ["-czf", prePath, "-C", this.appRoot, ...preTargets],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      const preErrs: Buffer[] = [];
      preProc.stderr?.on("data", (c: Buffer) => preErrs.push(c));
      preProc.stderr?.on("error", () => {});
      // Pakai waitForExit supaya error spawn (ENOENT) tidak naik jadi
      // uncaughtException — pre-backup adalah best-effort, gagal pun OK.
      const preExit = await this.waitForExit(preProc, "tar").catch(() => -1);
      if (preExit === 0) {
        preRestoreBackup = preName;
        logger.info("backup.uploads.pre_restore_saved", { filename: preName });
      } else {
        logger.warn("backup.uploads.pre_restore_failed", {
          err: Buffer.concat(preErrs).toString(),
          exit: preExit,
        });
        // jangan blocking — lanjut, tapi user gak punya rollback otomatis.
      }
    } catch {
      // folder uploads belum ada → skip pre-backup
    }

    // 2. Hapus isi folder uploads (bukan folder itu sendiri) DAN wa-session
    //    kalau ada, supaya tidak campur file lama + baru.
    await fs.mkdir(uploadsDir, { recursive: true });
    const entries = await fs.readdir(uploadsDir).catch(() => []);
    for (const entry of entries) {
      await fs
        .rm(path.join(uploadsDir, entry), { recursive: true, force: true })
        .catch(() => {});
    }

    // wa-session hanya dibersihkan kalau folder-nya sudah ada (artinya pernah
    // dipakai). Kalau bundle gak punya wa-session, folder ini tetap kosong.
    const waSessionDir = this.waSessionAbs();
    try {
      await fs.access(waSessionDir);
      const waEntries = await fs.readdir(waSessionDir).catch(() => []);
      for (const entry of waEntries) {
        await fs
          .rm(path.join(waSessionDir, entry), { recursive: true, force: true })
          .catch(() => {});
      }
    } catch {
      // belum ada — skip
    }

    // 3. Extract bundle. Asumsi bundle berisi prefix `data/uploads/...` dan
    //    optional `data/wa-session/...`.
    const extractProc = spawn(
      "tar",
      ["-xzf", realPath, "-C", this.appRoot],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const exErrs: Buffer[] = [];
    extractProc.stderr?.on("data", (c: Buffer) => exErrs.push(c));
    extractProc.stderr?.on("error", () => {});
    const exExit = await this.waitForExit(extractProc, "tar");
    if (exExit !== 0) {
      throw new Error(
        `Extract uploads gagal (exit ${exExit}): ${Buffer.concat(exErrs).toString()}`,
      );
    }

    // 4. Hitung file (rekursif) untuk laporan.
    let count = 0;
    async function walk(dir: string) {
      const list = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of list) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) count++;
      }
    }
    await walk(uploadsDir);

    logger.info("backup.uploads.restore.done", {
      source: path.basename(realPath),
      files: count,
      preRestoreBackup,
    });

    return { files: count, preRestoreBackup };
  }

  /**
   * Restore database dari file. Drop & recreate database, lalu import.
   * Source bisa absolute path, atau filename relatif ke backupDir.
   */
  async restore(source: string): Promise<{ tables: number; users: number }> {
    const conn = this.parseDbUrl();

    // Resolve full path
    const resolvedPath = path.isAbsolute(source)
      ? source
      : path.join(this.backupDir, path.basename(source));

    // Security: pastikan resolvedPath ada di backupDir atau folder upload
    // (cegah path traversal)
    const realPath = await fs.realpath(resolvedPath).catch(() => null);
    if (!realPath) throw new Error("File backup tidak ditemukan");

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) throw new Error("Source bukan file");

    // restore() khusus SQL. Bundle uploads harus pakai restoreUploads().
    if (/\.(tar\.gz|tgz)$/i.test(realPath)) {
      throw new Error(
        "File ini bundle uploads (.tar.gz). Gunakan restoreUploads().",
      );
    }
    if (!/\.(sql|sql\.gz)$/i.test(realPath)) {
      throw new Error("File harus .sql atau .sql.gz");
    }

    const compressed = realPath.endsWith(".gz");

    // 1. Drop & recreate database (sebagai root MySQL)
    // Catatan: connection user yg dipakai PTopup harus punya CREATE/DROP privilege.
    // Kalau cuma punya privilege di db spesifik, kita pakai TRUNCATE pattern.
    const { spawn } = await import("node:child_process");

    // Strategy: drop semua tables di database (gak butuh DROP DATABASE privilege)
    logger.info("backup.restore.start", { source: path.basename(realPath) });

    // Disable FK checks dulu, drop semua tables, baru import.
    // Lebih reliable daripada DROP DATABASE (butuh privilege root).
    const dropTablesSQL = `
SET FOREIGN_KEY_CHECKS = 0;
SET GROUP_CONCAT_MAX_LEN = 32768;
SET @tables = NULL;
SELECT GROUP_CONCAT('\`', table_name, '\`') INTO @tables
FROM information_schema.tables WHERE table_schema = DATABASE();
SET @tables = COALESCE(@tables, 'dummy');
SET @sql = CONCAT('DROP TABLE IF EXISTS ', @tables);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET FOREIGN_KEY_CHECKS = 1;
`.trim();

    // SECURITY: pass password via MYSQL_PWD env var (cegah leak via ps aux).
    // Helper skip env var kalau password kosong (local dev).
    const mysqlEnv = this.buildMysqlEnv(conn.password);
    const dropProc = spawn(
      "mysql",
      [
        `-h${conn.host}`,
        `-P${conn.port}`,
        `-u${conn.user}`,
        conn.database,
      ],
      { stdio: ["pipe", "pipe", "pipe"], env: mysqlEnv },
    );
    const dropErrs: Buffer[] = [];
    dropProc.stderr?.on("data", (c: Buffer) => dropErrs.push(c));
    dropProc.stderr?.on("error", () => {});

    // Pasang waitForExit DULU sebelum nulis ke stdin biar error spawn (ENOENT)
    // ke-handle, bukan naik jadi uncaughtException.
    const dropExitPromise = this.waitForExit(dropProc, "mysql");

    if (dropProc.stdin) {
      dropProc.stdin.on("error", () => {});
      dropProc.stdin.write(dropTablesSQL);
      dropProc.stdin.end();
    }

    const dropExit = await dropExitPromise;
    if (dropExit !== 0) {
      throw new Error(
        `Drop tables gagal: ${Buffer.concat(dropErrs).toString()}`,
      );
    }

    // 2. Import backup
    const importProc = spawn(
      "mysql",
      [
        `-h${conn.host}`,
        `-P${conn.port}`,
        `-u${conn.user}`,
        conn.database,
      ],
      { stdio: ["pipe", "pipe", "pipe"], env: mysqlEnv },
    );

    const importErrs: Buffer[] = [];
    importProc.stderr?.on("data", (c: Buffer) => importErrs.push(c));
    importProc.stderr?.on("error", () => {});

    // Pasang waitForExit duluan supaya ENOENT/error spawn ketangkep.
    const importExitPromise = this.waitForExit(importProc, "mysql");

    if (importProc.stdin) importProc.stdin.on("error", () => {});

    let importPipelineErr: unknown = null;
    if (compressed) {
      const readStream = createReadStream(realPath);
      const gunzip = createGunzip();
      try {
        await pipeline(readStream, gunzip, importProc.stdin!);
      } catch (err) {
        importPipelineErr = err;
      }
    } else {
      const readStream = createReadStream(realPath);
      try {
        await pipeline(readStream, importProc.stdin!);
      } catch (err) {
        importPipelineErr = err;
      }
    }

    const importExit = await importExitPromise;
    if (importPipelineErr) {
      throw new Error(
        `Import gagal saat ${compressed ? "decompress" : "baca file"}: ${
          (importPipelineErr as Error).message
        }`,
      );
    }
    if (importExit !== 0) {
      throw new Error(
        `Import exit code ${importExit}: ${Buffer.concat(importErrs).toString()}`,
      );
    }

    // 3. Verifikasi (pakai MYSQL_PWD juga)
    const tablesRes = await execFileAsync(
      "mysql",
      [
        `-h${conn.host}`,
        `-P${conn.port}`,
        `-u${conn.user}`,
        "-e",
        "SHOW TABLES;",
        conn.database,
      ],
      { env: mysqlEnv },
    );
    const tableLines = tablesRes.stdout.split("\n").filter(Boolean);
    const tables = Math.max(0, tableLines.length - 1); // minus header

    let users = 0;
    try {
      const usersRes = await execFileAsync(
        "mysql",
        [
          `-h${conn.host}`,
          `-P${conn.port}`,
          `-u${conn.user}`,
          "-e",
          "SELECT COUNT(*) FROM users;",
          conn.database,
        ],
        { env: mysqlEnv },
      );
      const m = usersRes.stdout.match(/\d+/g);
      users = m ? Number(m[m.length - 1]) : 0;
    } catch {
      // tabel users mungkin belum ada di backup lama
    }

    logger.info("backup.restore.done", {
      source: path.basename(realPath),
      tables,
      users,
    });

    return { tables, users };
  }

  /** List semua backup files di folder backups (DB + uploads). */
  async list(): Promise<BackupFile[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.backupDir);
    const result: BackupFile[] = [];

    for (const name of files) {
      // Filter file backup pattern (DB + uploads)
      if (!name.match(/\.(sql|sql\.gz|tar\.gz|tgz)$/i)) continue;

      const filepath = path.join(this.backupDir, name);
      try {
        const stat = await fs.stat(filepath);
        if (!stat.isFile()) continue;
        result.push({
          name,
          path: filepath,
          size: stat.size,
          sizeText: this.formatBytes(stat.size),
          createdAt: stat.birthtime,
          compressed: /\.(gz|tgz)$/i.test(name),
          kind: this.detectKind(name),
        });
      } catch {
        /* skip */
      }
    }

    // Sort newest first
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return result;
  }

  /** Hapus 1 file backup. */
  async delete(filename: string): Promise<void> {
    // Cegah path traversal
    const safeName = path.basename(filename);
    const filepath = path.join(this.backupDir, safeName);

    // Verifikasi file ada di backupDir
    const realPath = await fs.realpath(filepath).catch(() => null);
    if (!realPath || !realPath.startsWith(this.backupDir)) {
      throw new Error("File tidak valid atau di luar backup dir");
    }

    await fs.unlink(realPath);
    logger.info("backup.delete", { filename: safeName });
  }

  /** Hapus file > keepDays hari (rotation). Return count file yg dihapus. */
  async cleanup(keepDays: number): Promise<number> {
    if (keepDays <= 0) return 0;
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const files = await this.list();

    let deleted = 0;
    for (const f of files) {
      if (f.createdAt.getTime() < cutoff) {
        await fs.unlink(f.path).catch(() => {});
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.info("backup.cleanup", { deleted, keepDays });
    }
    return deleted;
  }

  /** Save uploaded file ke backup dir. Mendukung .sql, .sql.gz, .tar.gz, .tgz. */
  async saveUpload(file: File): Promise<BackupFile> {
    await this.ensureDir();

    if (!file.name.match(/\.(sql|sql\.gz|tar\.gz|tgz)$/i)) {
      throw new Error("File harus .sql / .sql.gz / .tar.gz / .tgz");
    }

    const safeName = path.basename(file.name).replace(/[^\w.-]/g, "_");
    const ts = new Date().toISOString().replace(/[-:T]/g, "").replace(/\..*$/, "");
    const filename = `uploaded-${ts}-${safeName}`;
    const filepath = path.join(this.backupDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    const stat = await fs.stat(filepath);
    return {
      name: filename,
      path: filepath,
      size: stat.size,
      sizeText: this.formatBytes(stat.size),
      createdAt: stat.birthtime,
      compressed: /\.(gz|tgz)$/i.test(filename),
      kind: this.detectKind(filename),
    };
  }

  /** Get backup directory path (untuk display di UI). */
  getDir(): string {
    return this.backupDir;
  }
}

export const backupService = new BackupService();
