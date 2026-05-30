"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck, Send } from "lucide-react";
import {
  ForgotPasswordRequestSchema,
  ForgotPasswordVerifySchema,
  type ForgotPasswordRequestInput,
  type ForgotPasswordVerifyInput,
} from "@/schemas/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneFull, setPhoneFull] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [ttlSec, setTtlSec] = useState(0);
  const [identifier, setIdentifier] = useState("");

  return (
    <div className="space-y-4">
      {step === 1 ? (
        <Step1Identifier
          onSuccess={(d) => {
            setIdentifier(d.identifier);
            setPhoneFull(d.phoneFull ?? "");
            setPhoneMasked(d.phoneMasked);
            setTtlSec(d.ttlSec);
            setStep(2);
          }}
        />
      ) : (
        <Step2Verify
          phone={phoneFull}
          phoneMasked={phoneMasked}
          ttlSec={ttlSec}
          identifier={identifier}
          onBack={() => setStep(1)}
          onResend={(d) => setTtlSec(d.ttlSec)}
        />
      )}
    </div>
  );
}

function Step1Identifier({
  onSuccess,
}: {
  onSuccess: (d: {
    identifier: string;
    phoneFull?: string;
    phoneMasked: string;
    ttlSec: number;
  }) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequestInput>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
  });

  async function onSubmit(values: ForgotPasswordRequestInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal kirim OTP");

      // Untuk cegah enumeration, tetap maju ke step 2 walau sent=false.
      // Form di step 2 akan menampilkan generic error saat verify gagal.
      if (json.data.sent) {
        toast.success("Kode OTP terkirim via WhatsApp");
      } else {
        toast.success(
          "Kalau akun ditemukan, kode OTP sudah dikirim via WhatsApp",
        );
      }

      onSuccess({
        identifier: values.identifier,
        phoneFull: json.data.phoneFull,
        phoneMasked: json.data.phone || "—",
        ttlSec: json.data.ttlSec ?? 300,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Email / Username / Nomor HP</Label>
        <Input
          id="identifier"
          autoComplete="username"
          placeholder="kamu@email.com atau 08xxxxxxxxxx"
          {...register("identifier")}
        />
        {errors.identifier && (
          <p className="text-xs text-destructive">
            {errors.identifier.message}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full gap-2" disabled={submitting}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Kirim Kode OTP
      </Button>
    </form>
  );
}

function Step2Verify({
  phone,
  phoneMasked,
  ttlSec,
  identifier,
  onBack,
  onResend,
}: {
  phone: string;
  phoneMasked: string;
  ttlSec: number;
  identifier: string;
  onBack: () => void;
  onResend: (d: { ttlSec: number }) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [remain, setRemain] = useState(ttlSec);

  useEffect(() => {
    setRemain(ttlSec);
  }, [ttlSec]);

  useEffect(() => {
    if (remain <= 0) return;
    const t = setInterval(() => setRemain((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [remain]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordVerifyInput>({
    resolver: zodResolver(ForgotPasswordVerifySchema),
    defaultValues: { phone },
  });

  async function onSubmit(values: ForgotPasswordVerifyInput) {
    if (!phone) {
      toast.error(
        "Akun tidak ditemukan. Pastikan email/username/nomor HP benar.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, phone }),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal reset password");
      toast.success("Password berhasil direset. Silakan login.");
      router.push("/login");
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
      const res = await fetch("/api/auth/forgot/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal kirim ulang");
      toast.success("Kode OTP baru terkirim");
      onResend({ ttlSec: json.data.ttlSec ?? 300 });
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
            Kode OTP dikirim ke <b className="font-mono">{phoneMasked}</b>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-primary hover:underline"
          >
            Ganti identitas
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

      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Konfirmasi password baru</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
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
          Reset Password
        </Button>
      </div>
    </form>
  );
}
