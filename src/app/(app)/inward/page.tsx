import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Inward section landing (Loop 36 / TASK-004). Only the Receiving Sheet
// flow (Flow 1) is built this loop - 3PL Inward (Flow "3PL Inward from
// Other Plant", GS-010) is a separate, not-yet-scoped flow, listed here
// as not-yet-built rather than linked to nothing, matching the
// established pattern (see Stock's own landing page).
export default function InwardLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Inward" title="Inward" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Link
          href="/inward/receiving-sheets"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">Receiving Sheets</div>
            <div className="text-xs text-muted">
              Digital receiving sheet - create, add pallets, dual-confirm, lock.
            </div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">3PL Inward (Other Plant)</div>
            <div className="text-xs">Not built yet.</div>
          </div>
        </div>
      </div>
    </>
  );
}
