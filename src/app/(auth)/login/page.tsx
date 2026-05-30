import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";

export const metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LoginPage() {
  const cfg = await settingsService.getWaConfig();
  const forgotEnabled =
    cfg.enabled && cfg.featureOtpReset && waService.isReady();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk ke akun</CardTitle>
        <CardDescription>
          Gunakan email atau username yang sudah terdaftar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LoginForm showForgotLink={forgotEnabled} />
        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Daftar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
