import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "فضاء الطباعة الرقمية — تأكيد الطلب",
  description: "أرسل تفاصيل طلبك بسهولة واختر جميع خيارات الطباعة والتغليف والدفع",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🖨️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-tajawal), sans-serif" }}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
