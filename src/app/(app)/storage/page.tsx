import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

// Storage section landing (Loop 24-25 / TASK-005 - see
// docs/PENDING_ITEMS.md PEN-023/PEN-024 for what is and is not built
// here). The Rack Map (SCREEN-003, Loop 25) reads real Location/
// Pallet data - it will show an empty grid until real locations exist
// (PEN-008), which is the honest state, not a placeholder.
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
  {
    href: "/storage/rack-map",
    title: "Rack Map",
    description: "Color-coded grid view of location occupancy, with search.",
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
      </div>
    </>
  );
}
