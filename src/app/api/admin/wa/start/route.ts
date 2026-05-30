import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { waService } from "@/services/wa.service";
import { settingsService, SETTING_KEYS } from "@/services/settings.service";
import { normalizePhone } from "@/lib/phone";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const StartSchema = z.object({
  pairingPhone: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const body = await req.json().catch(() => ({}));
  const input = StartSchema.parse(body);

  const cfg = await settingsService.getWaConfig();
  let phoneArg: string | undefined;
  if (cfg.linkMethod === "pairing") {
    const raw = input.pairingPhone ?? cfg.pairingPhone;
    const normalized = raw ? normalizePhone(raw) : null;
    if (!normalized) {
      throw Errors.badRequest(
        "Mode pairing membutuhkan nomor admin yang valid (62...).",
      );
    }
    phoneArg = normalized;
    // simpan supaya restart auto pakai nomor ini
    if (raw && raw !== cfg.pairingPhone) {
      await settingsService.set(SETTING_KEYS.WA_PAIRING_PHONE, normalized);
    }
  }

  const state = await waService.start({ pairingPhone: phoneArg });
  const updatedCfg = await settingsService.getWaConfig();
  return ok({
    state,
    config: {
      enabled: updatedCfg.enabled,
      linkMethod: updatedCfg.linkMethod,
      pairingPhone: updatedCfg.pairingPhone,
      featureOtpRegister: updatedCfg.featureOtpRegister,
      featureOtpReset: updatedCfg.featureOtpReset,
      featureNotifTx: updatedCfg.featureNotifTx,
      otpTtlSec: updatedCfg.otpTtlSec,
      otpResendCooldownSec: updatedCfg.otpResendCooldownSec,
      otpMaxAttempt: updatedCfg.otpMaxAttempt,
      tplOtpRegister: updatedCfg.tplOtpRegister,
      tplOtpReset: updatedCfg.tplOtpReset,
      tplTxPaid: updatedCfg.tplTxPaid,
      tplTxSuccess: updatedCfg.tplTxSuccess,
      tplTxFailed: updatedCfg.tplTxFailed,
      linkedJid: updatedCfg.linkedJid,
      linkedAt: updatedCfg.linkedAt,
    },
  });
});
