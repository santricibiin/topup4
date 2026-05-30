"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import {
  LoginSchema,
  LoginOtpVerifySchema,
  type LoginInput,
  type LoginOtpVerifyInput,
} from "@/schemas/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** Tampilkan link "Lupa password?" saat fitur OTP reset aktif & WA siap. */
  showForgotLink?: boolean;
}

type OtpStage = {
  phone: string; // E.164 full (untuk verify)
  phoneMasked: string; // versi disensor (untuk tampil)
  ttlSec: number;
};

export function LoginForm({ showForgotLink = false }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [otpStage, setOtpStage] = useState<OtpStage | null>(null);
  // Simpan kredensial untuk fitur "kirim ulang" OTP
  const [lastCreds, setLastCreds] = useState<LoginInput | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal masuk");

      if (json.data?.needsOtp) {
        setLastCreds(values);
        setOtpStage({
          phone: json.data.phoneFull,
          phoneMasked: json.data.phone,
          ttlSec: json.data.ttlSec ?? 300,
        });
        toast.success("Kode OTP terkirim via WhatsApp");
        return;
      }

      toast.success("Berhasil masuk");
      router.push("/topup");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (otpStage) {
    return (
      <LoginOtpStep
        stage={otpStage}
        onBack={() => setOtpStage(null)}
        onResend={async () => {
          if (!lastCreds) return;
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lastCreds),
          });
          const json = await res.json();
          if (!json.success || !json.data?.needsOtp) {
            throw new Error(json.error?.message ?? "Gagal kirim ulang");
          }
          setOtpStage({
            phone: json.data.phoneFull,
            phoneMasked: json.data.phone,
            ttlSec: json.data.ttlSec ?? 300,
          });
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Email atau Username</Label>
        <Input
          id="identifier"
          autoComplete="username"
          {...register("identifier")}
        />
        {errors.identifier && (
          <p className="text-xs text-destructive">{errors.identifier.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {showForgotLink && (
            <Link
              href="/forgot"
              className="text-xs text-primary hover:underline"
            >
              Lupa password?
            </Link>
          )}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Masuk
      </Button>
    </form>
  );
}

// ============================================================
// STEP OTP — input kode 6 digit setelah password benar
// ============================================================
function LoginOtpStep({
  stage,
  onBack,
  onResend,
}: {
  stage: OtpStage;
  onBack: () => void;
  onResend: () => Promise<void>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [remain, setRemain] = useState(stage.ttlSec);

  useEffect(() => {
    setRemain(stage.ttlSec);
  }, [stage.ttlSec]);

  useEffect(() => {
    if (remain <= 0) return;
    const t = setInterval(() => setRemain((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [remain]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginOtpVerifyInput>({
    resolver: zodResolver(LoginOtpVerifySchema),
    defaultValues: { phone: stage.phone },
  });

  async function onSubmit(values: LoginOtpVerifyInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, phone: stage.phone }),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Verifikasi gagal");
      toast.success("Berhasil masuk");
      router.push("/topup");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await onResend();
      toast.success("Kode OTP baru terkirim");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            Kode OTP dikirim ke{" "}
            <b className="font-mono">+{stage.phoneMasked}</b>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-primary hover:underline"
          >
            Batal
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">Kode OTP (6 digit)</Label>
        <Input
          id="code"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          className="font-mono tracking-[0.4em] text-center text-lg"
          {...register("code")}
        />
        {errors.code && (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        )}
        <div className="flex items-center justify-between text-xs">
          <span
            className={
              remain <= 30 ? "text-destructive" : "text-muted-foreground"
            }
            suppressHydrationWarning
          >
            {remain > 0 ? `Berlaku ${mm}:${ss}` : "Kode kadaluarsa"}
          </span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || remain > 0}
            className="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resending ? "Mengirim..." : "Kirim ulang"}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <Button type="submit" className="flex-1 gap-2" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Verifikasi &amp; Masuk
        </Button>
      </div>
    </form>
  );
}
