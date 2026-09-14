// Top-level navigation map, derived from the architecture blueprint's
// Information Architecture (Section 3.1). Sub-items (e.g. New Receiving
// Sheet vs Receiving Sheet History) are intentionally deferred to the
// screens that implement each section - this is shell-level nav only.
export type NavItem = {
  key: string;
  label: string;
  href: string;
  section: "main" | "operations" | "support";
  // one of the 5 items shown in the mobile bottom bar
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", section: "main", primary: true },
  { key: "inward", label: "Inward", href: "/inward", section: "operations", primary: true },
  { key: "storage", label: "Storage", href: "/storage", section: "operations", primary: true },
  { key: "holds", label: "Hold Management", href: "/holds", section: "operations" },
  { key: "bulk", label: "Bulk Management", href: "/bulk", section: "operations" },
  { key: "outward", label: "Outward", href: "/outward", section: "operations", primary: true },
  { key: "transfers", label: "Transfers", href: "/transfers", section: "operations" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", section: "support" },
  { key: "stock", label: "Stock", href: "/stock", section: "support", primary: true },
  { key: "masters", label: "Masters", href: "/masters", section: "support" },
  { key: "reports", label: "Reports", href: "/reports", section: "support" },
];

export const SECTION_LABELS: Record<NavItem["section"], string> = {
  main: "Main",
  operations: "Operations",
  support: "Support",
};
