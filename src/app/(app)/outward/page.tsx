import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Outward section landing (Loop 41 / TASK-008). Loading Sheet is the
// only screen built this loop - Flow 4's Inter-Warehouse Transfers
// (TASK-009) is a separate, not-yet-built task, listed here honestly.
export default function OutwardLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Outward" title="Outward" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Link
          href="/outward/loading-sheets"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">Loading Sheets</div>
            <div className="text-xs text-muted">
              Pick, load, verify, gate-pass, and dispatch (Flow 5/6).
            </div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">Inter-Warehouse Transfers</div>
            <div className="text-xs">Not built yet (TASK-009).</div>
          </div>
        </div>
      </div>
    </>
  );
}
