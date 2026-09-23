import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Masters section landing. Material and Warehouse Master are full CRUD;
// SAP Warehouse Master and Status Master are read-only (seeded), per the
// implementation spec's own scope for those two.
export default function MastersLandingPage() {
  return (
    <>
      <PageHeader title="Masters" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/masters/materials" icon="package" title="Material Master" description="Create and manage FG material codes." accent="#0D9488" />
        <SectionLink href="/masters/warehouses" icon="building" title="Warehouse Master" description="Create and manage warehouse locations." accent="#2563EB" />
        <SectionLink href="/masters/sap-codes" icon="hash" title="SAP Warehouse Master" description="45 FG-relevant SAP storage location codes (read-only)." accent="#475569" />
        <SectionLink href="/masters/statuses" icon="tag" title="Status Master" description="The 10 locked pallet/material status values (read-only)." accent="#7C3AED" />
      </div>
    </>
  );
}
