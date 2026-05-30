import { NextRequest } from "next/server";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { waService } from "@/services/wa.service";
import { settingsService } from "@/services/settings.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  await waService.stop();
  const cfg = await settingsService.getWaConfig();
  return ok({
    state: waService.getState(),
    config: {
      enabled: cfg.enabled,
      linkMethod: cfg.linkMethod,
      pairingPhone: cfg.pairingPhone,
      featureOtpRegister: cfg.featureOtpRegister,
      featureOtpReset: cfg.featureOtpReset,
      featureNotifTx: cfg.featureNotifTx,
      otpTtlSec: cfg.otpTtlSec,
      otpResendCooldownSec: cfg.otpResendCooldownSec,
      otpMaxAttempt: cfg.otpMaxAttempt,
      tplOtpRegister: cfg.tplOtpRegister,
      tplOtpReset: cfg.tplOtpReset,
      tplTxPaid: cfg.tplTxPaid,
      tplTxSuccess: cfg.tplTxSuccess,
      tplTxFailed: cfg.tplTxFailed,
      linkedJid: cfg.linkedJid,
      linkedAt: cfg.linkedAt,
    },
  });
});
