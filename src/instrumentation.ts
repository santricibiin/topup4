/**
 * Next.js instrumentation hook — dipanggil sekali saat app boot.
 *
 * Dipakai untuk start BackupScheduler agar auto-backup berjalan
 * sesuai konfigurasi tanpa harus ada request masuk dulu.
 *
 * Hanya jalan di runtime "nodejs" (skip edge runtime).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { backupScheduler } = await import(
      "@/services/backup-scheduler.service"
    );
    backupScheduler.start();
  } catch (err) {
    // jangan crash app boot karena scheduler gagal start
    // (mis. saat build / introspection)
    // eslint-disable-next-line no-console
    console.warn("[instrumentation] backupScheduler start failed:", err);
  }
}
