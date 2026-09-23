import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Reports landing - every report here is an existing, real screen; this page only groups them (the sidebar's Reports link previously 404ed).
export default function ReportsLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Support / Reports" title="Reports" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/stock/in-out-summary" icon="◔" title="In-Out Report" description="Daily IN vs OUT by material and shift - Excel export included." accent="#0D9488" />
        <SectionLink href="/stock/aging" icon="⌛" title="FIFO Aging Report" description="Stock age buckets and FIFO compliance rate." accent="#D97706" />
        <SectionLink href="/stock/ledger" icon="⇩" title="DSR Excel Export" description="Stock ledger in the DSR sheet format, filterable by transaction type." accent="#0B1F3A" />
      </div>
    </>
  );
}
