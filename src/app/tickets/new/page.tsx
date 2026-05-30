import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TicketCategory } from "@prisma/client";
import { getCurrentUser } from "@/server/auth";
import { Card, CardContent } from "@/components/ui/card";
import { TicketCreateForm } from "@/features/tickets/components/ticket-create-form";

export const metadata = { title: "Buat Tiket" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    orderId?: string;
    depositId?: string;
    subject?: string;
    category?: string;
  };
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/tickets/new");

  const validCategory =
    searchParams.category && searchParams.category in TicketCategory
      ? (searchParams.category as TicketCategory)
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke daftar tiket
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Buat Tiket Baru
        </h1>
        <p className="text-sm text-muted-foreground">
          Sertakan deskripsi sejelas mungkin. Anda bisa lampirkan screenshot
          atau dokumen pendukung (PNG/JPG/WEBP/PDF, maks 5 MB per file).
        </p>
      </div>

      <Card>
        <CardContent className="p-5 md:p-6">
          <TicketCreateForm
            defaultSubject={searchParams.subject ?? ""}
            defaultCategory={validCategory ?? null}
            relatedOrderId={searchParams.orderId ?? null}
            relatedDepositId={searchParams.depositId ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
