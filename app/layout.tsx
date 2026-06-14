import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SGK Geçici İş Göremezlik Ödeneği Hesaplama",
  description: "SGK 5510 Sayılı Kanun 17. Madde kapsamında geçici iş göremezlik ödeneği hesaplama aracı",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
