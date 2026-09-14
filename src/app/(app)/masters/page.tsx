import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Masters section landing (Loop 21). Only Material Master is built so
// far (TASK-003) - Warehouse Master, SAP Warehouse Master, and Status
// Master master-data screens are listed as not-yet-built rather than
// linked to a page that does not exist, per the same "don't fabricate
// a working link for unbuilt scope" rule the earlier nav-items loop
// already followed for other sections.
export default function MastersLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Masters" title="Masters" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Link
          href="/masters/materials"
          className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
        >
          <div>
            <div className="text-sm font-bold text-navy">Material Master</div>
            <div className="text-xs text-muted">Create and manage FG material codes.</div>
          </div>
          <span className="text-teal">&rarr;</span>
        </Link>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">Warehouse Master</div>
            <div className="text-xs">Not built yet.</div>
          </div>
        </div>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">SAP Warehouse Master</div>
            <div className="text-xs">Not built yet (seeded reference data only).</div>
          </div>
        </div>
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">Status Master</div>
            <div className="text-xs">Not built yet (seeded reference data only).</div>
          </div>
        </div>
      </div>
    </>
  );
}
