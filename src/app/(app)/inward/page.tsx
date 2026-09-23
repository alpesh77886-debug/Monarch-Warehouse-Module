import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Inward section landing. 3PL inward from another plant has no screen of its own yet (a 3PL-destination transfer is received via Transfers).
export default function InwardLandingPage() {
  return (
    <>
      <PageHeader title="Inward" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/inward/receiving-sheets" icon="clipboard" title="Receiving Sheets" description="Digital receiving sheet - create, add pallets, dual-confirm, lock." accent="#0D9488" />
        <SectionLink icon="building" title="3PL Inward (Other Plant)" description="Not built yet." />
      </div>
    </>
  );
}
