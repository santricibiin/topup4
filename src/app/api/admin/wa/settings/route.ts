import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, ok } from "@/server/api-handler";
import { requireAdminApi } from "@/server/admin";
import { settingsService, SETTING_KEYS } from "@/services/settings.service";
import { normalizePhone } from "@/lib/phone";
import { Errors } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SettingsSchema = z.object({
  enabled: z.boolean().optional(),
  linkMethod: z.enum(["qr", "pairing"]).optional(),
  pairingPhone: z.string().optional(),
  featureOtpRegister: z.boolean().optional(),
  featureOtpReset: z.boolean().optional(),
  featureOtpLogin: z.boolean().optional(),
  featureNotifTx: z.boolean().optional(),
  otpTtlSec: z.number().int().min(60).max(900).optional(),
  otpResendCooldownSec: z.number().int().min(15).max(600).optional(),
  otpMaxAttempt: z.number().int().min(3).max(10).optional(),
  tplOtpRegister: z.string().min(10).max(2000).optional(),
  tplOtpReset: z.string().min(10).max(2000).optional(),
  tplOtpLogin: z.string().min(10).max(2000).optional(),
  tplTxPaid: z.string().min(10).max(2000).optional(),
  tplTxSuccess: z.string().min(10).max(2000).optional(),
  tplTxFailed: z.string().min(10).max(2000).optional(),
});

export const PUT = apiHandler(async (req: NextRequest) => {
  await requireAdminApi(req);
  const body = await req.json();
  const input = SettingsSchema.parse(body);

  const entries: Array<{ key: keyof typeof SETTING_KEYS; value: string }> = [];

  if (input.enabled !== undefined) {
    entries.push({ key: "WA_ENABLED", value: String(input.enabled) });
  }
  if (input.linkMethod !== undefined) {
    entries.push({ key: "WA_LINK_METHOD", value: input.linkMethod });
  }
  if (input.pairingPhone !== undefined) {
    if (input.pairingPhone === "") {
      entries.push({ key: "WA_PAIRING_PHONE", value: "" });
    } else {
      const norm = normalizePhone(input.pairingPhone);
      if (!norm) {
        throw Errors.badRequest("Nomor pairing tidak valid.");
      }
      entries.push({ key: "WA_PAIRING_PHONE", value: norm });
    }
  }
  if (input.featureOtpRegister !== undefined) {
    entries.push({
      key: "WA_FEATURE_OTP_REGISTER",
      value: String(input.featureOtpRegister),
    });
  }
  if (input.featureOtpReset !== undefined) {
    entries.push({
      key: "WA_FEATURE_OTP_RESET",
      value: String(input.featureOtpReset),
    });
  }
  if (input.featureOtpLogin !== undefined) {
    entries.push({
      key: "WA_FEATURE_OTP_LOGIN",
      value: String(input.featureOtpLogin),
    });
  }
  if (input.featureNotifTx !== undefined) {
    entries.push({
      key: "WA_FEATURE_NOTIF_TX",
      value: String(input.featureNotifTx),
    });
  }
  if (input.otpTtlSec !== undefined) {
    entries.push({ key: "WA_OTP_TTL_SEC", value: String(input.otpTtlSec) });
  }
  if (input.otpResendCooldownSec !== undefined) {
    entries.push({
      key: "WA_OTP_RESEND_COOLDOWN_SEC",
      value: String(input.otpResendCooldownSec),
    });
  }
  if (input.otpMaxAttempt !== undefined) {
    entries.push({
      key: "WA_OTP_MAX_ATTEMPT",
      value: String(input.otpMaxAttempt),
    });
  }
  if (input.tplOtpRegister !== undefined) {
    entries.push({ key: "WA_TPL_OTP_REGISTER", value: input.tplOtpRegister });
  }
  if (input.tplOtpReset !== undefined) {
    entries.push({ key: "WA_TPL_OTP_RESET", value: input.tplOtpReset });
  }
  if (input.tplOtpLogin !== undefined) {
    entries.push({ key: "WA_TPL_OTP_LOGIN", value: input.tplOtpLogin });
  }
  if (input.tplTxPaid !== undefined) {
    entries.push({ key: "WA_TPL_TX_PAID", value: input.tplTxPaid });
  }
  if (input.tplTxSuccess !== undefined) {
    entries.push({ key: "WA_TPL_TX_SUCCESS", value: input.tplTxSuccess });
  }
  if (input.tplTxFailed !== undefined) {
    entries.push({ key: "WA_TPL_TX_FAILED", value: input.tplTxFailed });
  }

  if (entries.length === 0) {
    return ok({ updated: 0 });
  }

  await settingsService.setMany(
    entries.map((e) => ({ key: SETTING_KEYS[e.key], value: e.value })),
  );

  return ok({ updated: entries.length });
});
