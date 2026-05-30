"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  MessageSquare,
  RotateCcw,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Initial {
  tplOtpRegister: string | null;
  tplOtpReset: string | null;
  tplOtpLogin: string | null;
  tplTxPaid: string | null;
  tplTxSuccess: string | null;
  tplTxFailed: string | null;
}

type TplKey =
  | "tplOtpRegister"
  | "tplOtpReset"
  | "tplOtpLogin"
  | "tplTxPaid"
  | "tplTxSuccess"
  | "tplTxFailed";

interface TplDef {
  key: TplKey;
  label: string;
  desc: string;
  placeholders: string[];
}

const TEMPLATES: TplDef[] = [
  {
    key: "tplOtpRegister",
    label: "OTP — Daftar Akun",
    desc: "Dikirim saat user request OTP untuk daftar akun baru.",
    placeholders: ["{{site}}", "{{kode}}", "{{ttl_menit}}"],
  },
  {
    key: "tplOtpReset",
    label: "OTP — Lupa Password",
    desc: "Dikirim saat user request OTP untuk reset password.",
    placeholders: ["{{site}}", "{{kode}}", "{{ttl_menit}}"],
  },
  {
    key: "tplOtpLogin",
    label: "OTP — Login (2FA)",
    desc: "Dikirim saat user butuh kode 2-faktor sebelum masuk.",
    placeholders: ["{{site}}", "{{kode}}", "{{ttl_menit}}"],
  },
  {
    key: "tplTxPaid",
    label: "Notif — Pembayaran Diterima",
    desc: "Saat status transaksi berubah ke PAID.",
    placeholders: ["{{site}}", "{{order_id}}", "{{produk}}", "{{tujuan}}"],
  },
  {
    key: "tplTxSuccess",
    label: "Notif — Transaksi Sukses",
    desc: "Saat transaksi berhasil diproses provider. {{sn_line}} = baris SN (kosong kalau gak ada).",
    placeholders: [
      "{{site}}",
      "{{order_id}}",
      "{{produk}}",
      "{{tujuan}}",
      "{{sn_line}}",
    ],
  },
  {
    key: "tplTxFailed",
    label: "Notif — Transaksi Gagal",
    desc: "Saat transaksi gagal & saldo dikembalikan.",
    placeholders: [
      "{{site}}",
      "{{order_id}}",
      "{{produk}}",
      "{{tujuan}}",
      "{{pesan}}",
    ],
  },
];

export function WaTemplatesForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<TplKey, string>>({
    tplOtpRegister: initial.tplOtpRegister ?? "",
    tplOtpReset: initial.tplOtpReset ?? "",
    tplOtpLogin: initial.tplOtpLogin ?? "",
    tplTxPaid: initial.tplTxPaid ?? "",
    tplTxSuccess: initial.tplTxSuccess ?? "",
    tplTxFailed: initial.tplTxFailed ?? "",
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    values.tplOtpRegister !== (initial.tplOtpRegister ?? "") ||
    values.tplOtpReset !== (initial.tplOtpReset ?? "") ||
    values.tplOtpLogin !== (initial.tplOtpLogin ?? "") ||
    values.tplTxPaid !== (initial.tplTxPaid ?? "") ||
    values.tplTxSuccess !== (initial.tplTxSuccess ?? "") ||
    values.tplTxFailed !== (initial.tplTxFailed ?? "");

  function handleReset() {
    setValues({
      tplOtpRegister: initial.tplOtpRegister ?? "",
      tplOtpReset: initial.tplOtpReset ?? "",
      tplOtpLogin: initial.tplOtpLogin ?? "",
      tplTxPaid: initial.tplTxPaid ?? "",
      tplTxSuccess: initial.tplTxSuccess ?? "",
      tplTxFailed: initial.tplTxFailed ?? "",
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wa/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal simpan");
      toast.success("Template tersimpan.");
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
          <MessageSquare className="h-5 w-5" />
          Template Pesan
        </h2>
        <p className="text-sm text-muted-foreground">
          Pakai placeholder <code>{"{{key}}"}</code> untuk variabel dinamis. Klik
          chip placeholder untuk salin.
        </p>
      </div>

      <div className="space-y-5">
        {TEMPLATES.map((tpl) => (
          <TplField
            key={tpl.key}
            def={tpl}
            value={values[tpl.key]}
            onChange={(v) => setValues((s) => ({ ...s, [tpl.key]: v }))}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!dirty || saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

function TplField({
  def,
  value,
  onChange,
}: {
  def: TplDef;
  value: string;
  onChange: (v: string) => void;
}) {
  function copyPlaceholder(p: string) {
    navigator.clipboard
      .writeText(p)
      .then(() => toast.success(`Disalin: ${p}`))
      .catch(() => toast.error("Gagal salin"));
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={def.key} className="text-sm font-medium">
        {def.label}
      </Label>
      <p className="text-xs text-muted-foreground">{def.desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {def.placeholders.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => copyPlaceholder(p)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-muted",
            )}
            title="Klik untuk salin"
          >
            <Copy className="h-3 w-3" />
            {p}
          </button>
        ))}
      </div>
      <textarea
        id={def.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </div>
  );
}
