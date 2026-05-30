"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck, Send } from "lucide-react";
import {
  RegisterSchema,
  RegisterOtpRequestSchema,
  RegisterOtpVerifySchema,
  type RegisterInput,
  type RegisterOtpRequestInput,
  type RegisterOtpVerifyInput,
} from "@/schemas/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** Kalau true, render flow 2-step OTP. Kalau false, flow biasa. */
  otpEnabled?: boolean;
}

export function RegisterForm({ otpEnabled = false }: Props) {
  if (otpEnabled) return <RegisterFormOtp />;
  return <RegisterFormPlain />;
}

// ============================================================
// FLOW LAMA — tanpa OTP
// ============================================================
function RegisterFormPlain() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(RegisterSchema) });

  async function onSubmit(values: RegisterInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal daftar");
      toast.success("Akun berhasil dibuat");
      router.push("/topup");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" {...register("username")} />
          {errors.username && (
            <p className="text-xs text-destructive">{errors.username.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Nomor HP (opsional)</Label>
        <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Daftar
      </Button>
    </form>
  );
}

// ============================================================
// FLOW BARU — 2 step (request OTP → verify + buat akun)
// ============================================================
function RegisterFormOtp() {
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState<string>(""); // E.164 dari server
  const [ttlSec, setTtlSec] = useState<number>(0);

  function handleOtpRequested(data: { phone: string; ttlSec: number }) {
    setPhone(data.phone);
    setTtlSec(data.ttlSec);
    setStep(2);
  }

  return (
    <div className="space-y-4">
      <Steps current={step} />
      {step === 1 ? (
        <Step1Phone onSuccess={handleOtpRequested} />
      ) : (
        <Step2Verify
          phone={phone}
          ttlSec={ttlSec}
          onBack={() => setStep(1)}
          onResend={(d) => {
            setTtlSec(d.ttlSec);
          }}
        />
      )}
    </div>
  );
}

function Steps({ current }: { current: 1 | 2 }) {
  const items = [
    { n: 1, label: "Verifikasi HP" },
    { n: 2, label: "Lengkapi data" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {items.map((it, idx) => {
        const active = it.n === current;
        const done = it.n < current;
        return (
          <li key={it.n} className="flex items-center gap-2">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold " +
                (done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground")
              }
            >
              {it.n}
            </span>
            <span
              className={
                active ? "font-medium" : "text-muted-foreground"
              }
            >
              {it.label}
            </span>
            {idx === 0 && (
              <span className="mx-1 h-px w-6 bg-muted-foreground/30" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ----------- STEP 1: input nomor HP -----------
function Step1Phone({
  onSuccess,
}: {
  onSuccess: (data: { phone: string; ttlSec: number }) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterOtpRequestInput>({
    resolver: zodResolver(RegisterOtpRequestSchema),
  });

  async function onSubmit(values: RegisterOtpRequestInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal kirim OTP");
      toast.success("Kode OTP terkirim via WhatsApp");
      onSuccess({ phone: json.data.phone, ttlSec: json.data.ttlSec });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Nomor WhatsApp</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="08xxxxxxxxxx"
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Format: 08xx, 62xx, atau +62xx. Pastikan nomor aktif WhatsApp.
        </p>
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

// ----------- STEP 2: verify OTP + isi data -----------
function Step2Verify({
  phone,
  ttlSec,
  onBack,
  onResend,
}: {
  phone: string;
  ttlSec: number;
  onBack: () => void;
  onResend: (data: { phone: string; ttlSec: number }) => void;
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
  } = useForm<RegisterOtpVerifyInput>({
    resolver: zodResolver(RegisterOtpVerifySchema),
    defaultValues: { phone },
  });

  async function onSubmit(values: RegisterOtpVerifyInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, phone }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal verify");
      toast.success("Akun berhasil dibuat");
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
      const res = await fetch("/api/auth/register/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error?.message ?? "Gagal kirim ulang");
      toast.success("Kode OTP baru terkirim");
      onResend({ phone: json.data.phone, ttlSec: json.data.ttlSec });
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
            Kode OTP dikirim ke <b className="font-mono">+{phone}</b>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-primary hover:underline"
          >
            Ganti nomor
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            {...register("username")}
          />
          {errors.username && (
            <p className="text-xs text-destructive">{errors.username.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nama lengkap (opsional)</Label>
        <Input id="fullName" autoComplete="name" {...register("fullName")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
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
          Verifikasi &amp; Daftar
        </Button>
      </div>
    </form>
  );
}
