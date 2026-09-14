import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Storage section landing (Loop 24 / TASK-005, partial - see
// docs/PENDING_ITEMS.md PEN-023 for what is and is not built here).
// The visual color-coded Rack Map (SCREEN-003) is NOT built this
// loop - it needs real location grid data (PEN-008, still pending)
// to be a meaningful demonstration, not an empty grid; what IS built
// is the underlying Location CRUD and the putaway/move business logic
// SCREEN-003 would eventually sit on top of.
const STORAGE_SCREENS = [
  {
    href: "/storage/locations",
    title: "Locations",
    description: "Create and manage storage locations (admin).",
  },
  {
    href: "/storage/putaway",
    title: "Putaway & Move",
    description: "Assign a pallet to a location, or move it to a new one.",
  },
];

export default function StorageLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Home / Storage" title="Storage" />
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        {STORAGE_SCREENS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex min-h-[64px] items-center justify-between rounded-xl border border-line bg-white p-4 shadow-card"
          >
            <div>
              <div className="text-sm font-bold text-navy">{s.title}</div>
              <div className="text-xs text-muted">{s.description}</div>
            </div>
            <span className="text-teal">&rarr;</span>
          </Link>
        ))}
        <div className="flex min-h-[64px] items-center justify-between rounded-xl border border-dashed border-line bg-white/60 p-4 text-muted">
          <div>
            <div className="text-sm font-bold">Rack Map (visual grid)</div>
            <div className="text-xs">Not built yet - needs a real location grid to show.</div>
          </div>
        </div>
      </div>
    </>
  );
}
