import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Stock section landing (Loop 26 / TASK-011, partial; Loop 39 adds
// In-Out Summary - PEN-031; Loop 48 adds FIFO Aging Report - TASK-013).
// Excel export is not its own screen - it's the "Export" button already
// on Stock Ledger and In-Out Summary themselves, using the real DSR
// column layout (Loop 28).
export default function StockLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Stock" title="Stock" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Link
          href="/stock/ledger"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">Stock Ledger</div>
            <div className="text-xs text-muted">
              Full append-only transaction log (paginated, filterable).
            </div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
        <Link
          href="/stock/in-out-summary"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">In-Out Summary</div>
            <div className="text-xs text-muted">
              IN vs OUT quantity by material/shift/day, with a full-detail export.
            </div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
        <Link
          href="/stock/aging"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">Stock Aging (FIFO)</div>
            <div className="text-xs text-muted">
              Current stock aged by batch production date, plus FIFO compliance rate.
            </div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
      </div>
    </>
  );
}
