import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBF FG Warehouse",
  description: "Iscon Balaji Foods — Finished Goods Warehouse Module",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
