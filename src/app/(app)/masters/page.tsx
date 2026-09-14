import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Masters section landing. All 4 TASK-003 masters screens are built
// (Loops 21-22): Material Master and Warehouse Master are full CRUD
// (create/list/deactivate); SAP Warehouse Master and Status Master
// are read-only, matching the implementation spec's own scope for
// those two ("read-only after seed" / "read-only, seeded").
const MASTERS = [
  {
    href: "/masters/materials",
    title: "Material Master",
    description: "Create and manage FG material codes.",
  },
  {
    href: "/masters/warehouses",
    title: "Warehouse Master",
    description: "Create and manage warehouse locations.",
  },
  {
    href: "/masters/sap-codes",
    title: "SAP Warehouse Master",
    description: "45 FG-relevant SAP storage location codes (read-only).",
  },
  {
    href: "/masters/statuses",
    title: "Status Master",
    description: "The 10 locked pallet/material status values (read-only).",
  },
];

export default function MastersLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Masters" title="Masters" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        {MASTERS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
          >
            <div>
              <div className="text-sm font-bold text-navy">{m.title}</div>
              <div className="text-xs text-muted">{m.description}</div>
            </div>
            <span className="text-teal">&rarr;</span>
          </Link>
        ))}
      </div>
    </>
  );
}
