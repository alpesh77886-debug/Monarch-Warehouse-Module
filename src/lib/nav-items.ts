import type { IconName } from "@/components/icons";

// Top-level navigation map, derived from the architecture blueprint's
// Information Architecture (Section 3.1).
export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  // gradient stops for the item's icon chip
  tint: [string, string];
  section: "main" | "operations" | "support";
  // one of the 5 items shown in the mobile bottom bar; the rest live behind its "More" sheet
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "dashboard", tint: ["#2B5288", "#0B1F3A"], section: "main", primary: true },
  { key: "inward", label: "Inward", href: "/inward", icon: "inward", tint: ["#14B8A6", "#0F766E"], section: "operations", primary: true },
  { key: "storage", label: "Storage", href: "/storage", icon: "storage", tint: ["#38BDF8", "#0369A1"], section: "operations", primary: true },
  { key: "holds", label: "Hold Management", href: "/holds", icon: "holds", tint: ["#FBBF24", "#B45309"], section: "operations" },
  { key: "bulk", label: "Bulk Management", href: "/bulk", icon: "bulk", tint: ["#A78BFA", "#6D28D9"], section: "operations" },
  { key: "outward", label: "Outward", href: "/outward", icon: "outward", tint: ["#818CF8", "#4338CA"], section: "operations", primary: true },
  { key: "transfers", label: "Transfers", href: "/transfers", icon: "transfers", tint: ["#60A5FA", "#1D4ED8"], section: "operations" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", icon: "maintenance", tint: ["#94A3B8", "#334155"], section: "support" },
  { key: "stock", label: "Stock", href: "/stock", icon: "stock", tint: ["#34D399", "#047857"], section: "support", primary: true },
  { key: "masters", label: "Masters", href: "/masters", icon: "masters", tint: ["#22D3EE", "#0E7490"], section: "support" },
  { key: "reports", label: "Reports", href: "/reports", icon: "reports", tint: ["#FB7185", "#9F1239"], section: "support" },
];

export const SECTION_LABELS: Record<NavItem["section"], string> = {
  main: "Main",
  operations: "Operations",
  support: "Support",
};

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inward: "Inward",
  "receiving-sheets": "Receiving Sheets",
  storage: "Storage",
  "rack-map": "Rack Map",
  putaway: "Putaway & Move",
  locations: "Locations",
  holds: "Hold Management",
  bulk: "Bulk Management",
  outward: "Outward",
  "loading-sheets": "Loading Sheets",
  transfers: "Transfers",
  maintenance: "Maintenance",
  stock: "Stock",
  ledger: "Stock Ledger",
  "in-out-summary": "In-Out Summary",
  aging: "Stock Aging",
  masters: "Masters",
  materials: "Material Master",
  warehouses: "Warehouse Master",
  "sap-codes": "SAP Codes",
  statuses: "Status Master",
  reports: "Reports",
};

export type Crumb = { label: string; href: string };

// Home > Section > Page trail for the current route. Unknown segments are
// record ids (e.g. a receiving sheet's id) and read as "Detail".
export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }];
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) return crumbs;
  segments.forEach((segment, i) => {
    crumbs.push({
      label: SEGMENT_LABELS[segment] ?? "Detail",
      href: "/" + segments.slice(0, i + 1).join("/"),
    });
  });
  return crumbs;
}

// Where the Back button goes: one level up the route tree, and top-level
// sections go to the Dashboard. null on the Dashboard itself.
export function parentHref(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) return null;
  if (segments.length === 1) return "/dashboard";
  return "/" + segments.slice(0, -1).join("/");
}
