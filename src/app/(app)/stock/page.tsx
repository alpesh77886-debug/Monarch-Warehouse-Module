import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Stock section landing.
export default function StockLandingPage() {
  return (
    <>
      <PageHeader title="Stock" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/stock/ledger" icon="ledger" title="Stock Ledger" description="Full append-only transaction log (paginated, filterable)." accent="#0B1F3A" />
        <SectionLink href="/stock/in-out-summary" icon="inOut" title="In-Out Summary" description="IN vs OUT quantity by material/shift/day, with a full-detail export." accent="#0D9488" />
        <SectionLink href="/stock/aging" icon="aging" title="Stock Aging (FIFO)" description="Current stock aged by batch production date, plus FIFO compliance rate." accent="#D97706" />
      </div>
    </>
  );
}
