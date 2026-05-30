"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Sparkles,
  UserPlus,
  KeyRound,
  LogIn,
  Bell,
  Clock,
  Repeat,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Initial {
  featureOtpRegister: boolean;
  featureOtpReset: boolean;
  featureOtpLogin: boolean;
  featureNotifTx: boolean;
  otpTtlSec: number;
  otpResendCooldownSec: number;
  otpMaxAttempt: number;
}

export function WaFeaturesForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [otpReg, setOtpReg] = useState(initial.featureOtpRegister);
  const [otpReset, setOtpReset] = useState(initial.featureOtpReset);
  const [otpLogin, setOtpLogin] = useState(initial.featureOtpLogin);
  const [notifTx, setNotifTx] = useState(initial.featureNotifTx);
  const [ttl, setTtl] = useState(initial.otpTtlSec);
  const [cooldown, setCooldown] = useState(initial.otpResendCooldownSec);
  const [maxAttempt, setMaxAttempt] = useState(initial.otpMaxAttempt);
  const [saving, setSaving] = useState(false);

  const dirty =
    otpReg !== initial.featureOtpRegister ||
    otpReset !== initial.featureOtpReset ||
    otpLogin !== initial.featureOtpLogin ||
    notifTx !== initial.featureNotifTx ||
    ttl !== initial.otpTtlSec ||
    cooldown !== initial.otpResendCooldownSec ||
    maxAttempt !== initial.otpMaxAttempt;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    if (ttl < 60 || ttl > 900) {
      toast.error("TTL OTP harus 60–900 detik.");
      return;
    }
    if (cooldown < 15 || cooldown > 600) {
      toast.error("Cooldown harus 15–600 detik.");
      return;
    }
    if (maxAttempt < 3 || maxAttempt > 10) {
      toast.error("Max attempt harus 3–10.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wa/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureOtpRegister: otpReg,
          featureOtpReset: otpReset,
          featureOtpLogin: otpLogin,
          featureNotifTx: notifTx,
          otpTtlSec: ttl,
          otpResendCooldownSec: cooldown,
          otpMaxAttempt: maxAttempt,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal simpan");
      toast.success("Konfigurasi fitur tersimpan.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5" />
          Fitur
        </h2>
        <p className="text-sm text-muted-foreground">
          Pilih fitur yang aktif. Membutuhkan master switch &amp; akun WA
          terhubung.
        </p>
      </div>

      <div className="space-y-3">
        <FeatureToggle
          icon={UserPlus}
          checked={otpReg}
          onChange={setOtpReg}
          title="OTP saat daftar"
          desc="User wajib verifikasi nomor HP via OTP sebelum akun dibuat."
        />
        <FeatureToggle
          icon={KeyRound}
          checked={otpReset}
          onChange={setOtpReset}
          title="OTP lupa password"
          desc="User reset password lewat OTP yang dikirim ke nomor HP terdaftar."
        />
        <FeatureToggle
          icon={LogIn}
          checked={otpLogin}
          onChange={setOtpLogin}
          title="OTP saat login (2FA)"
          desc="Setelah password benar, user wajib masukkan kode OTP yang dikirim ke nomor HP terdaftar. User tanpa nomor HP akan login normal."
        />
        <FeatureToggle
          icon={Bell}
          checked={notifTx}
          onChange={setNotifTx}
          title="Notifikasi transaksi"
          desc="Kirim WA otomatis saat transaksi user berubah status (paid, success, failed). User juga punya opsi opt-out di profil."
        />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4" />
          Parameter OTP
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldNumber
            id="otpTtl"
            label="TTL OTP (detik)"
            icon={Clock}
            value={ttl}
            onChange={setTtl}
            min={60}
            max={900}
            hint="Lama OTP valid. 60–900 detik."
          />
          <FieldNumber
            id="otpCooldown"
            label="Cooldown resend (detik)"
            icon={Repeat}
            value={cooldown}
            onChange={setCooldown}
            min={15}
            max={600}
            hint="Jeda minimum antar permintaan OTP."
          />
          <FieldNumber
            id="otpMax"
            label="Max percobaan"
            icon={ShieldAlert}
            value={maxAttempt}
            onChange={setMaxAttempt}
            min={3}
            max={10}
            hint="OTP dianggap hangus setelah salah sekian kali."
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!dirty || saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan
        </Button>
      </div>
    </form>
  );
}

function FeatureToggle({
  icon: Icon,
  checked,
  onChange,
  title,
  desc,
}: {
  icon: typeof Bell;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/30",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

function FieldNumber({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  id: string;
  label: string;
  icon: typeof Bell;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
