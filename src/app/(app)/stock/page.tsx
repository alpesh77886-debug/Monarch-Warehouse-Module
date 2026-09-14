import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Stock section landing (Loop 26 / TASK-011, partial). Only the
// Stock Ledger list is built this loop - Excel export, In-Out
// Summary, and the FIFO Aging Report are separate TASK-011 bullets,
// listed here as not-yet-built rather than linked to nothing.
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
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">In-Out Summary</div>
            <div className="text-xs">Not built yet.</div>
          </div>
        </div>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">Excel Export (DSR format)</div>
            <div className="text-xs">Not built yet - the real DSR column layout is not available yet (same class of gap as PEN-007).</div>
          </div>
        </div>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">FIFO Aging Report</div>
            <div className="text-xs">Not built yet.</div>
          </div>
        </div>
      </div>
    </>
  );
}
