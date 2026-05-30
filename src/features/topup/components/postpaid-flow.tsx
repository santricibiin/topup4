"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Wallet,
  Receipt,
  Search,
  X,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn, formatIDR } from "@/lib/utils";

interface ProductDTO {
  id: string;
  sku: string;
  name: string;
  type: string;
  sellPrice: string;
  description: string | null;
}

interface Props {
  brand: string;
  category: string;
  products: ProductDTO[];
  /** Nama situs yang di-set admin (branding). Dipakai di label pembayaran. */
  siteName: string;
}

interface BillDetailRow {
  periode?: string;
  nilai_tagihan?: string;
  admin?: string;
  denda?: string;
  [key: string]: string | undefined;
}

interface BillDesc {
  tarif?: string;
  daya?: number;
  lembar_tagihan?: number;
  alamat?: string;
  jatuh_tempo?: string;
  detail?: BillDetailRow[];
  [key: string]: unknown;
}

interface InquiryResult {
  orderId: string;
  productName: string;
  customerNo: string;
  customerName: string;
  billAmount: string;
  baseAmount: string;
  adminFee: string;
  desc: BillDesc | null;
}

/**
 * Flow pascabayar (tagihan): pilih produk → cek tagihan (inquiry) →
 * tampilkan rincian tagihan → bayar.
 */
export function PostpaidFlow({ brand, products, siteName }: Props) {
  const router = useRouter();

  const [selectedSku, setSelectedSku] = useState<string>(
    products.length === 1 ? products[0]!.sku : "",
  );
  const [customerNo, setCustomerNo] = useState("");
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [bill, setBill] = useState<InquiryResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedProduct = products.find((p) => p.sku === selectedSku);

  async function handleInquiry() {
    if (!selectedProduct) {
      toast.error("Pilih produk terlebih dahulu");
      return;
    }
    const v = customerNo.trim();
    if (v.length < 3) {
      toast.error("Nomor pelanggan minimal 3 karakter");
      return;
    }
    setChecking(true);
    setBill(null);
    try {
      const res = await fetch("/api/transactions/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSku: selectedProduct.sku,
          customerNo: v,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.error?.code === "UNAUTHORIZED") {
          toast.error("Silakan masuk terlebih dahulu");
          router.push("/login");
          return;
        }
        throw new Error(json.error?.message ?? "Cek tagihan gagal");
      }
      setBill(json.data as InquiryResult);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handlePay() {
    if (!bill) return;
    setPaying(true);
    try {
      const res = await fetch("/api/transactions/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: bill.orderId }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.error?.code === "UNAUTHORIZED") {
          toast.error("Silakan masuk terlebih dahulu");
          router.push("/login");
          return;
        }
        throw new Error(json.error?.message ?? "Pembayaran gagal");
      }
      setConfirmOpen(false);
      router.push(`/transaction/${bill.orderId}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Cek tagihan {brand}</CardTitle>
          <CardDescription>
            Masukkan nomor pelanggan untuk menampilkan rincian tagihan sebelum
            membayar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {products.length > 1 && (
            <div className="space-y-2">
              <Label>Pilih Produk</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((p) => {
                  const active = p.sku === selectedSku;
                  return (
                    <button
                      key={p.sku}
                      type="button"
                      onClick={() => {
                        setSelectedSku(p.sku);
                        setBill(null);
                      }}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left text-sm transition-all",
                        active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50",
                      )}
                    >
                      <div className="font-semibold leading-tight">{p.name}</div>
                      <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                        {p.type}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="customerNo">Nomor Pelanggan</Label>
            <div className="relative">
              <Receipt className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="customerNo"
                inputMode="numeric"
                autoComplete="off"
                value={customerNo}
                onChange={(e) => {
                  setCustomerNo(e.target.value);
                  setBill(null);
                }}
                placeholder="Nomor pelanggan / ID tagihan"
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInquiry();
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sesuai nomor billing tagihanmu.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleInquiry} disabled={checking}>
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Cek Tagihan
            </Button>
          </div>
        </CardContent>
      </Card>

      {bill && (
        <Card className="mx-auto max-w-2xl">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Rincian Tagihan</CardTitle>
              <CardDescription>{bill.productName}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <dl className="divide-y divide-border/60">
              <BillRow label="Nama Pelanggan" value={bill.customerName} />
              <BillRow label="No. Pelanggan" value={bill.customerNo} />
              {bill.desc?.tarif && (
                <BillRow label="Tarif / Daya" value={billTarifDaya(bill.desc)} />
              )}
              {typeof bill.desc?.lembar_tagihan === "number" && (
                <BillRow
                  label="Lembar Tagihan"
                  value={String(bill.desc.lembar_tagihan)}
                />
              )}
              {bill.desc?.alamat && (
                <BillRow label="Alamat" value={bill.desc.alamat} />
              )}
            </dl>

            {bill.desc?.detail && bill.desc.detail.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Detail Periode
                </p>
                <div className="space-y-2">
                  {bill.desc.detail.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-4 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {d.periode ?? `Lembar ${i + 1}`}
                      </span>
                      <span className="font-medium tabular-nums">
                        {d.nilai_tagihan ? formatIDR(d.nilai_tagihan) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <dl className="divide-y divide-border/60">
              <BillRow label="Tagihan + Admin Provider" value={formatIDR(bill.baseAmount)} />
              <BillRow label="Biaya Layanan" value={formatIDR(bill.adminFee)} />
              <div className="flex items-center justify-between gap-4 pt-3">
                <dt className="text-muted-foreground">Total Bayar</dt>
                <dd className="text-lg font-semibold tabular-nums text-primary">
                  {formatIDR(bill.billAmount)}
                </dd>
              </div>
            </dl>

            <Button className="w-full" onClick={() => setConfirmOpen(true)}>
              Bayar {formatIDR(bill.billAmount)}
            </Button>
          </CardContent>
        </Card>
      )}

      {confirmOpen && bill && (
        <ConfirmPayDialog
          brand={brand}
          bill={bill}
          paying={paying}
          siteName={siteName}
          onClose={() => !paying && setConfirmOpen(false)}
          onConfirm={handlePay}
        />
      )}
    </div>
  );
}

function billTarifDaya(desc: BillDesc): string {
  const parts: string[] = [];
  if (desc.tarif) parts.push(desc.tarif);
  if (typeof desc.daya === "number") parts.push(`${desc.daya} VA`);
  return parts.join(" / ");
}

interface ConfirmPayDialogProps {
  brand: string;
  bill: InquiryResult;
  paying: boolean;
  siteName: string;
  onClose: () => void;
  onConfirm: () => void;
}

function ConfirmPayDialog({
  brand,
  bill,
  paying,
  siteName,
  onClose,
  onConfirm,
}: ConfirmPayDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !paying) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, paying]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
        disabled={paying}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold tracking-tight">Konfirmasi Pembayaran</h3>
              <p className="text-xs text-muted-foreground">
                Periksa rincian sebelum membayar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5 text-sm">
          <dl className="divide-y divide-border/60">
            <BillRow label="Produk" value={bill.productName} />
            <BillRow label="Brand" value={brand} />
            <BillRow label="Nama Pelanggan" value={bill.customerName} />
            <BillRow label="No. Pelanggan" value={bill.customerNo} />
            <div className="flex items-center justify-between gap-4 pt-3">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold tabular-nums text-primary">
                {formatIDR(bill.billAmount)}
              </dd>
            </div>
          </dl>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Pembayaran via Saldo {siteName}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={paying}
          >
            Batal
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={paying}>
            {paying && <Loader2 className="h-4 w-4 animate-spin" />}
            Bayar {formatIDR(bill.billAmount)}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BillRow({ label, value }: { label: string; value?: string | null }) {
  const empty = !value || value.trim() === "";
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "max-w-[60%] truncate text-right font-medium",
          empty && "text-muted-foreground/60",
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}
