import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { settingsService } from "@/services/settings.service";
import { waService } from "@/services/wa.service";
import { WaStatusCard } from "@/features/admin/components/wa-status-card";
import { WaModeForm } from "@/features/admin/components/wa-mode-form";
import { WaFeaturesForm } from "@/features/admin/components/wa-features-form";
import { WaTemplatesForm } from "@/features/admin/components/wa-templates-form";
import { WaTestSendForm } from "@/features/admin/components/wa-test-send-form";

export const metadata = { title: "Admin · WhatsApp" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminWaPage() {
  const cfg = await settingsService.getWaConfig();
  const initialState = waService.getState();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <MessageCircle className="h-6 w-6 text-primary md:h-7 md:w-7" />
          Konfigurasi WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Hubungkan akun WhatsApp untuk OTP daftar/lupa password dan notifikasi
          transaksi. Sesi tetap aktif setelah server restart.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-5 md:p-6">
            <WaStatusCard initialState={initialState} initialConfig={cfg} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <WaModeForm initial={cfg} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <WaFeaturesForm initial={cfg} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <WaTemplatesForm initial={cfg} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <WaTestSendForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
