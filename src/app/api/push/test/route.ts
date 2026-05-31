/**
 * POST /api/push/test → kirim notifikasi uji ke semua device user sendiri.
 *
 * Dipakai tombol "Test Notifikasi" di halaman profil untuk memastikan
 * subscription device aktif & payload sampai.
 */
import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { Errors } from "@/lib/errors";
import { getCurrentUserFromRequest } from "@/server/auth";
import { pushService } from "@/services/push.service";
import { settingsService } from "@/services/settings.service";

export const dynamic = "force-dynamic";

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUserFromRequest(req);
  if (!user) throw Errors.unauthorized();

  if (!pushService.isConfigured()) {
    throw Errors.badRequest("Push notification belum dikonfigurasi server.");
  }

  const count = await pushService.countForUser(user.id);
  if (count === 0) {
    throw Errors.badRequest(
      "Belum ada device terdaftar. Aktifkan notifikasi di perangkat ini dulu.",
    );
  }

  const branding = await settingsService.getSiteBranding();
  const sent = await pushService.sendToUser(user.id, {
    title: `${branding.name} — Test Notifikasi`,
    body: "Notifikasi push aktif. Kamu akan dapat update transaksi di sini.",
    url: "/profile",
    tag: "push-test",
  });

  return ok({ sent });
});
