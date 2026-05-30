"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Loader2,
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Power,
  PowerOff,
  Unlink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { cn } from "@/lib/utils";

type WaStatus =
  | "DISCONNECTED"
  | "INITIALIZING"
  | "QR_REQUIRED"
  | "PAIRING_REQUIRED"
  | "CONNECTED"
  | "LOGGED_OUT"
  | "ERROR";

interface WaState {
  status: WaStatus;
  jid: string | null;
  qr: string | null;
  qrDataUri: string | null;
  qrExpiresAt: number | null;
  pairingCode: string | null;
  pairingExpiresAt: number | null;
  pairingPhone: string | null;
  lastError: string | null;
  lastUpdatedAt: number;
}

interface WaConfig {
  enabled: boolean;
  linkMethod: "qr" | "pairing";
  pairingPhone: string | null;
  linkedJid: string | null;
  linkedAt: string | null;
}

interface Props {
  initialState: WaState;
  initialConfig: WaConfig;
}

export function WaStatusCard({ initialState, initialConfig }: Props) {
  const [state, setState] = useState<WaState>(initialState);
  const [config, setConfig] = useState<WaConfig>(initialConfig);
  const [busy, setBusy] = useState<"start" | "stop" | "unlink" | null>(null);
  const [pairingPhone, setPairingPhone] = useState(
    initialConfig.pairingPhone ?? "",
  );
  const [confirmType, setConfirmType] = useState<"stop" | "unlink" | null>(
    null,
  );
  // `now` di-init 0 supaya SSR dan client first-render sama.
  // Setelah mount baru di-update agar timer jalan tanpa hydration mismatch.
  const [now, setNow] = useState(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // polling status setiap 3 detik kalau belum CONNECTED
  useEffect(() => {
    const needPoll =
      state.status === "INITIALIZING" ||
      state.status === "QR_REQUIRED" ||
      state.status === "PAIRING_REQUIRED";

    if (!needPoll) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const tick = async () => {
      try {
        const res = await fetch("/api/admin/wa/status", { cache: "no-store" });
        const j = await res.json();
        if (j?.success) {
          setState(j.data.state);
          setConfig(j.data.config);
        }
      } catch {
        // diam, akan retry lagi
      }
    };
    tick();
    pollingRef.current = setInterval(tick, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [state.status]);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/wa/status", { cache: "no-store" });
      const j = await res.json();
      if (j?.success) {
        setState(j.data.state);
        setConfig(j.data.config);
      }
    } catch {
      // diam
    }
  }

  async function handleStart() {
    if (config.linkMethod === "pairing" && !pairingPhone.trim()) {
      toast.error("Masukkan nomor HP untuk pairing.");
      return;
    }
    setBusy("start");
    try {
      const res = await fetch("/api/admin/wa/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingPhone:
            config.linkMethod === "pairing" ? pairingPhone.trim() : undefined,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal start");
      setState(j.data.state);
      toast.success(
        config.linkMethod === "qr"
          ? "Generating QR..."
          : "Generating pairing code...",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("stop");
    try {
      const res = await fetch("/api/admin/wa/stop", { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal stop");
      setState(j.data.state);
      toast.success("Koneksi dihentikan.");
      setConfirmType(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlink() {
    setBusy("unlink");
    try {
      const res = await fetch("/api/admin/wa/unlink", { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal unlink");
      setState(j.data.state);
      setConfig((c) => ({ ...c, linkedJid: null, linkedAt: null }));
      toast.success("WhatsApp telah diputus.");
      setConfirmType(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Status Koneksi</h2>
          <p className="text-sm text-muted-foreground">
            Pantau dan kelola koneksi WhatsApp.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refresh}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <StatusBadge state={state} />

      {state.lastError && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>{state.lastError}</div>
        </div>
      )}

      {state.status === "QR_REQUIRED" && state.qrDataUri && (
        <QrPanel
          dataUri={state.qrDataUri}
          expiresAt={state.qrExpiresAt}
          now={now}
        />
      )}

      {state.status === "PAIRING_REQUIRED" && state.pairingCode && (
        <PairingPanel
          code={state.pairingCode}
          phone={state.pairingPhone}
          expiresAt={state.pairingExpiresAt}
          now={now}
        />
      )}

      {state.status === "CONNECTED" && (
        <ConnectedPanel jid={state.jid} linkedAt={config.linkedAt} />
      )}

      {/* Pairing phone input — hanya ditampilkan saat method=pairing & belum running */}
      {config.linkMethod === "pairing" &&
        (state.status === "DISCONNECTED" ||
          state.status === "LOGGED_OUT" ||
          state.status === "ERROR") && (
          <div className="space-y-2">
            <Label htmlFor="pairingPhone">Nomor HP (untuk pairing)</Label>
            <Input
              id="pairingPhone"
              placeholder="08xxxxxxxxxx"
              value={pairingPhone}
              onChange={(e) => setPairingPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Format: 08xx, 62xx, atau +62xx. Akan dipakai untuk request pairing
              code.
            </p>
          </div>
        )}

      <div className="flex flex-wrap items-center gap-2">
        {(state.status === "DISCONNECTED" ||
          state.status === "LOGGED_OUT" ||
          state.status === "ERROR") && (
          <Button
            type="button"
            onClick={handleStart}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            Hubungkan
          </Button>
        )}

        {(state.status === "QR_REQUIRED" ||
          state.status === "PAIRING_REQUIRED" ||
          state.status === "INITIALIZING" ||
          state.status === "CONNECTED") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmType("stop")}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === "stop" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PowerOff className="h-4 w-4" />
            )}
            Hentikan
          </Button>
        )}

        {(state.status === "CONNECTED" || config.linkedJid) && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmType("unlink")}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === "unlink" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
            Putuskan & Hapus Sesi
          </Button>
        )}
      </div>

      <ConfirmModal
        open={confirmType === "stop"}
        title="Hentikan koneksi WhatsApp?"
        description={
          <div className="space-y-2">
            <p>
              Layanan WhatsApp akan berhenti merespon. OTP dan notifikasi
              transaksi tidak akan terkirim sampai dijalankan ulang.
            </p>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
              Sesi tetap tersimpan, jadi tidak perlu scan ulang saat dijalankan
              kembali.
            </p>
          </div>
        }
        confirmLabel="Ya, hentikan"
        cancelLabel="Batal"
        variant="default"
        loading={busy === "stop"}
        onConfirm={handleStop}
        onClose={() => busy !== "stop" && setConfirmType(null)}
      />

      <ConfirmModal
        open={confirmType === "unlink"}
        title="Putuskan & hapus sesi WhatsApp?"
        description={
          <div className="space-y-2">
            <p>
              Akun{" "}
              <span className="font-mono text-foreground">
                {state.jid ? `+${state.jid.split("@")[0]}` : "—"}
              </span>{" "}
              akan diputus dan kredensial dihapus dari server.
            </p>
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Anda perlu scan QR / pairing code lagi untuk menautkan ulang.
              Tindakan ini tidak bisa dibatalkan.
            </p>
          </div>
        }
        confirmLabel="Ya, putuskan"
        cancelLabel="Batal"
        variant="destructive"
        loading={busy === "unlink"}
        onConfirm={handleUnlink}
        onClose={() => busy !== "unlink" && setConfirmType(null)}
      />
    </div>
  );
}

function StatusBadge({ state }: { state: WaState }) {
  const map: Record<
    WaStatus,
    { label: string; cls: string; Icon: typeof QrCode }
  > = {
    DISCONNECTED: {
      label: "Belum terhubung",
      cls: "border-muted text-muted-foreground bg-muted/30",
      Icon: PowerOff,
    },
    INITIALIZING: {
      label: "Menyiapkan...",
      cls: "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300",
      Icon: Loader2,
    },
    QR_REQUIRED: {
      label: "Menunggu scan QR",
      cls: "border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300",
      Icon: QrCode,
    },
    PAIRING_REQUIRED: {
      label: "Menunggu pairing code",
      cls: "border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300",
      Icon: Smartphone,
    },
    CONNECTED: {
      label: "Terhubung",
      cls: "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300",
      Icon: CheckCircle2,
    },
    LOGGED_OUT: {
      label: "Logged out",
      cls: "border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30 dark:text-orange-300",
      Icon: PowerOff,
    },
    ERROR: {
      label: "Error",
      cls: "border-destructive/40 text-destructive bg-destructive/10",
      Icon: XCircle,
    },
  };
  const it = map[state.status];
  const Icon = it.Icon;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
        it.cls,
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          state.status === "INITIALIZING" && "animate-spin",
        )}
      />
      {it.label}
    </div>
  );
}

function QrPanel({
  dataUri,
  expiresAt,
  now,
}: {
  dataUri: string;
  expiresAt: number | null;
  now: number;
}) {
  const remain = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  return (
    <div className="rounded-xl border bg-muted/20 p-5">
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
        <div className="rounded-lg border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUri}
            alt="QR WhatsApp"
            className="h-56 w-56 select-none md:h-64 md:w-64"
          />
        </div>
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Cara scan:</div>
          <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
            <li>Buka WhatsApp di HP utama</li>
            <li>Tap menu (titik 3) ➜ Perangkat tertaut</li>
            <li>Tap “Tautkan perangkat”</li>
            <li>Scan QR di samping</li>
          </ol>
          {expiresAt && (
            <div
              suppressHydrationWarning
              className={cn(
                "pt-2 text-xs",
                remain <= 10 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              QR refresh dalam {remain}s
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PairingPanel({
  code,
  phone,
  expiresAt,
  now,
}: {
  code: string;
  phone: string | null;
  expiresAt: number | null;
  now: number;
}) {
  const remain = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  return (
    <div className="rounded-xl border bg-muted/20 p-5">
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Pairing code untuk {phone ?? "—"}:
        </div>
        <div className="font-mono text-3xl font-bold tracking-[0.3em] md:text-4xl">
          {code}
        </div>
        <div className="text-sm text-muted-foreground">
          Buka WhatsApp ➜ Perangkat tertaut ➜ <b>Tautkan dengan nomor telepon</b>{" "}
          ➜ masukkan kode di atas.
        </div>
        {expiresAt && (
          <div
            suppressHydrationWarning
            className={cn(
              "text-xs",
              remain <= 10 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            Kode kadaluarsa dalam {remain}s
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectedPanel({
  jid,
  linkedAt,
}: {
  jid: string | null;
  linkedAt: string | null;
}) {
  const number = jid ? jid.split("@")[0] : "—";
  // Format tanggal di client only — Node TZ vs browser TZ beda → hydration mismatch.
  const [formatted, setFormatted] = useState<string | null>(null);
  useEffect(() => {
    if (!linkedAt) return;
    setFormatted(
      new Date(linkedAt).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, [linkedAt]);

  return (
    <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/60 p-4 text-sm dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        Akun terhubung
      </div>
      <div className="mt-2 space-y-0.5 text-muted-foreground">
        <div>Nomor: <span className="font-mono">+{number}</span></div>
        {linkedAt && (
          <div suppressHydrationWarning>
            Terhubung sejak: {formatted ?? "…"}
          </div>
        )}
      </div>
    </div>
  );
}
