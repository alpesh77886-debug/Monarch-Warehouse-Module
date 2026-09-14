import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

// Route group for every screen behind the app shell. Auth gating is
// added in the Clerk loop - this layout is shell-only for now.
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
