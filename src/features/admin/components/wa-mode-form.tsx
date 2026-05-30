"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, QrCode, Smartphone, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Initial {
  enabled: boolean;
  linkMethod: "qr" | "pairing";
  pairingPhone: string | null;
}

export function WaModeForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [method, setMethod] = useState<"qr" | "pairing">(initial.linkMethod);
  const [pairingPhone, setPairingPhone] = useState(
    initial.pairingPhone ?? "",
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    enabled !== initial.enabled ||
    method !== initial.linkMethod ||
    pairingPhone !== (initial.pairingPhone ?? "");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      // Saat method=qr, jangan kirim pairingPhone (server schema tolak null).
      // Pairing phone tetap disimpan di DB supaya kalau balik ke pairing
      // nomornya tidak hilang.
      const body: Record<string, unknown> = {
        enabled,
        linkMethod: method,
      };
      if (method === "pairing") {
        body.pairingPhone = pairingPhone.trim();
      }
      const res = await fetch("/api/admin/wa/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal simpan");
      toast.success("Mode tautan tersimpan.");
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
          <Power className="h-5 w-5" />
          Mode &amp; Master Switch
        </h2>
        <p className="text-sm text-muted-foreground">
          Aktifkan layanan dan pilih metode menautkan akun WhatsApp.
        </p>
      </div>

      {/* Master enable */}
      <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/30 transition-colors">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <div className="space-y-0.5">
          <div className="font-medium">Aktifkan layanan WhatsApp</div>
          <div className="text-xs text-muted-foreground">
            Master switch untuk semua fitur (OTP, notifikasi). Kalau off, semua
            fitur turunan ikut off walau toggle-nya nyala.
          </div>
        </div>
      </label>

      {/* Link method */}
      <div className="space-y-2">
        <Label>Metode tautan</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <MethodOption
            checked={method === "qr"}
            onChange={() => setMethod("qr")}
            icon={QrCode}
            title="QR Code"
            desc="Scan QR di HP utama. Mirip WhatsApp Web."
          />
          <MethodOption
            checked={method === "pairing"}
            onChange={() => setMethod("pairing")}
            icon={Smartphone}
            title="Pairing Code"
            desc="Masukkan kode 8 karakter di HP. Tidak butuh kamera."
          />
        </div>
      </div>

      {method === "pairing" && (
        <div className="space-y-2">
          <Label htmlFor="pairingPhone">Nomor HP default untuk pairing</Label>
          <Input
            id="pairingPhone"
            placeholder="08xxxxxxxxxx"
            value={pairingPhone}
            onChange={(e) => setPairingPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Format: 08xx, 62xx, atau +62xx. Bisa juga di-override saat klik
            “Hubungkan”.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!dirty || saving}
          className="gap-2"
        >
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

function MethodOption({
  checked,
  onChange,
  icon: Icon,
  title,
  desc,
}: {
  checked: boolean;
  onChange: () => void;
  icon: typeof QrCode;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "hover:bg-muted/30",
      )}
    >
      <input
        type="radio"
        name="wa-method"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4"
      />
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}
