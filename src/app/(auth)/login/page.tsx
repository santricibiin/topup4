import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk ke akun</CardTitle>
        <CardDescription>
          Gunakan email atau username yang sudah terdaftar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LoginForm />
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
