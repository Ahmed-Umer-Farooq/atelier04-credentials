import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atelier04 — Digital Credentials",
  description: "EU-recognized digital credential verification — Atelier04 ESKE GmbH",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
