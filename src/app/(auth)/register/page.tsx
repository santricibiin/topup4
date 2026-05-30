import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Daftar" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat akun baru</CardTitle>
        <CardDescription>
          Gratis. Cukup beberapa detik dan kamu sudah bisa transaksi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
