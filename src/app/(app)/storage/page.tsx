import { PageHeader } from "@/components/layout/PageHeader";
import { SectionLink } from "@/components/ui";

// Storage section landing.
export default function StorageLandingPage() {
  return (
    <>
      <PageHeader breadcrumb="Operations / Storage" title="Storage" />
      <div className="flex flex-col gap-3 bg-canvas p-4 sm:p-6">
        <SectionLink href="/storage/rack-map" icon="▦" title="Rack Map" description="Color-coded grid view of location occupancy, with search." accent="#0284C7" />
        <SectionLink href="/storage/putaway" icon="⇅" title="Putaway & Move" description="Assign a pallet to a location, or move it to a new one." accent="#0D9488" />
        <SectionLink href="/storage/locations" icon="⌖" title="Locations" description="Create and manage storage locations (admin)." accent="#475569" />
      </div>
    </>
  );
}
