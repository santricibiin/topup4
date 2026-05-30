import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";

export const metadata = { title: "Daftar" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RegisterPage() {
  const cfg = await settingsService.getWaConfig();
  const otpEnabled =
    cfg.enabled && cfg.featureOtpRegister && waService.isReady();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat akun baru</CardTitle>
        <CardDescription>
          {otpEnabled
            ? "Verifikasi nomor HP via WhatsApp lalu lengkapi data akun."
            : "Gratis. Cukup beberapa detik dan kamu sudah bisa transaksi."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RegisterForm otpEnabled={otpEnabled} />
        <p className="text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
