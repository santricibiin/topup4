"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Bell, BellOff, Smartphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPushSupport,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  hasActiveSubscription,
} from "@/features/profile/lib/push-client";

interface Props {
  initial: { notifPush: boolean };
  vapidPublicKey: string;
}

export function PushNotificationForm({ initial, vapidPublicKey }: Props) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [supportReason, setSupportReason] = useState<string | undefined>();
  const [deviceOn, setDeviceOn] = useState(false);
  const [prefOn, setPrefOn] = useState(initial.notifPush);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [ready, setReady] = useState(false);

  // Deteksi dukungan & status subscription device saat mount.
  useEffect(() => {
    const support = getPushSupport();
    setSupported(support.supported);
    setSupportReason(support.reason);
    if (!support.supported) {
      setReady(true);
      return;
    }
    hasActiveSubscription()
      .then((active) => setDeviceOn(active && getNotificationPermission() === "granted"))
      .catch(() => setDeviceOn(false))
      .finally(() => setReady(true));
  }, []);

  async function savePref(next: boolean) {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifPush: next }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Gagal simpan");
  }

  async function enable() {
    setBusy(true);
    try {
      await subscribeToPush(vapidPublicKey);
      await savePref(true);
      setDeviceOn(true);
      setPrefOn(true);
      toast.success("Notifikasi aktif di perangkat ini");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      await savePref(false);
      setDeviceOn(false);
      setPrefOn(false);
      toast.success("Notifikasi dimatikan di perangkat ini");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Gagal kirim");
      toast.success("Notifikasi uji terkirim. Cek perangkatmu.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        {supportReason ?? "Perangkat/browser ini tidak mendukung notifikasi push."}
        <p className="mt-1 text-amber-600/80 dark:text-amber-400/80">
          Tips: di Android pasang aplikasi (APK) atau tambahkan ke layar utama
          lewat Chrome agar notifikasi bisa berjalan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4 transition-colors",
          deviceOn ? "border-primary/40 bg-primary/5" : "border-border",
        )}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            {deviceOn ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            Notifikasi di Perangkat Ini
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dapatkan notifikasi langsung saat status transaksi berubah
            (pembayaran diterima, berhasil, gagal) dan saldo deposit masuk —
            tanpa perlu buka aplikasi.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {deviceOn ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={disable}
                  disabled={busy || !ready}
                  className="text-destructive hover:bg-destructive/10"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5" />
                  )}
                  Matikan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={sendTest}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Test Notifikasi
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={enable}
                disabled={busy || !ready}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bell className="h-3.5 w-3.5" />
                )}
                Aktifkan Notifikasi
              </Button>
            )}
          </div>
        </div>
      </div>

      {deviceOn && !prefOn && (
        <p className="text-xs text-muted-foreground">
          Catatan: preferensi akun mematikan push. Aktifkan kembali untuk mulai
          menerima notifikasi.
        </p>
      )}
    </div>
  );
}
