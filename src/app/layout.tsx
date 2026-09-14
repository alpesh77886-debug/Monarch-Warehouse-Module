import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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

// STUB MODE - see src/middleware.ts. Without a real publishable key,
// ClerkProvider is skipped so the app still renders and builds.
const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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

  return hasClerkPublishableKey ? <ClerkProvider>{document}</ClerkProvider> : document;
}
