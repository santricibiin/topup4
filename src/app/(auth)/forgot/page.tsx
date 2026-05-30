import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotForm } from "@/features/auth/components/forgot-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";

export const metadata = { title: "Lupa Password" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ForgotPasswordPage() {
  const cfg = await settingsService.getWaConfig();
  // Kalau fitur off / WA belum siap, balikin ke login
  if (!cfg.enabled || !cfg.featureOtpReset || !waService.isReady()) {
    redirect("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lupa password</CardTitle>
        <CardDescription>
          Masukkan email, username, atau nomor HP terdaftar. Kami akan kirim kode
          OTP ke WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ForgotForm />
        <p className="text-center text-sm text-muted-foreground">
          Ingat password?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
