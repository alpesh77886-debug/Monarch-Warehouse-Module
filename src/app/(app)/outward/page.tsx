import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Outward section landing.
export default function OutwardLandingPage() {
  return (
    <>
      <PageHeader title="Outward" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/outward/loading-sheets" icon="outward" title="Loading Sheets" description="Pick, load, verify, gate-pass, and dispatch (Flow 5/6)." accent="#0D9488" />
        <SectionLink href="/transfers" icon="transfers" title="Inter-Warehouse Transfers" description="Move stock to another warehouse / 3PL with batch traceability (Flow 4)." accent="#2563EB" />
      </div>
    </>
  );
}
