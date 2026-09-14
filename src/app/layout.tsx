import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { getClerkConfigStatus } from "@/lib/clerk-config";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IBF FG Warehouse",
  description: "Iscon Balaji Foods — Finished Goods Warehouse Module",
};

// STUB MODE - see src/middleware.ts and src/lib/clerk-config.ts. Without
// a real, fully-set publishable+secret key pair, ClerkProvider is
// skipped so the app still renders and builds.
const clerkConfigured = getClerkConfigStatus() === "configured";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const document = (
    <html lang="en" className={plusJakartaSans.variable}>
      <body className="bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );

  return clerkConfigured ? <ClerkProvider>{document}</ClerkProvider> : document;
}
