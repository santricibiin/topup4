import { Navbar } from "@/components/layout/navbar";

export default function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="container flex-1 py-6 md:py-10">{children}</main>
    </>
  );
}
