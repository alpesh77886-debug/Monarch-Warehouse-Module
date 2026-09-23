// Top-level navigation map, derived from the architecture blueprint's
// Information Architecture (Section 3.1). Icons are the reference
// mockup's own glyphs (reference/IBF_FG_Warehouse_Frontend_Design_v5.html).
export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
  section: "main" | "operations" | "support";
  // one of the 5 items shown in the mobile bottom bar; the rest live behind its "More" sheet
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "◧", section: "main", primary: true },
  { key: "inward", label: "Inward", href: "/inward", icon: "⇩", section: "operations", primary: true },
  { key: "storage", label: "Storage", href: "/storage", icon: "▦", section: "operations", primary: true },
  { key: "holds", label: "Hold Management", href: "/holds", icon: "⚠", section: "operations" },
  { key: "bulk", label: "Bulk Management", href: "/bulk", icon: "◫", section: "operations" },
  { key: "outward", label: "Outward", href: "/outward", icon: "⇗", section: "operations", primary: true },
  { key: "transfers", label: "Transfers", href: "/transfers", icon: "⇄", section: "operations" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", icon: "⚙", section: "support" },
  { key: "stock", label: "Stock", href: "/stock", icon: "☰", section: "support", primary: true },
  { key: "masters", label: "Masters", href: "/masters", icon: "⌗", section: "support" },
  { key: "reports", label: "Reports", href: "/reports", icon: "◔", section: "support" },
];

export const SECTION_LABELS: Record<NavItem["section"], string> = {
  main: "Main",
  operations: "Operations",
  support: "Support",
};

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
