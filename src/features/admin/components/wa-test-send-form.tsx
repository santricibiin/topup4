"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WaTestSendForm() {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState(
    "Tes kirim WA dari panel admin. Kalau pesan ini sampai berarti koneksi sudah siap.",
  );
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !text.trim()) {
      toast.error("Nomor dan pesan wajib diisi.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/wa/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), text }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message ?? "Gagal kirim");
      toast.success("Pesan terkirim.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSend} className="space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="h-5 w-5" />
          Test Kirim
        </h2>
        <p className="text-sm text-muted-foreground">
          Verifikasi koneksi dengan kirim pesan ke nomor manapun. Membutuhkan
          status terhubung.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="testPhone">Nomor tujuan</Label>
          <Input
            id="testPhone"
            placeholder="08xxxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="testText">Pesan</Label>
          <textarea
            id="testText"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      <Button type="submit" disabled={sending} className="gap-2">
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Kirim
      </Button>
    </form>
  );
}
