import { PageHeader } from "@/components/layout/PageHeader";

// Shell demonstration page only (Loop 4) - no dashboard business logic,
// no data, no KPIs yet. Proves the app shell reflows at every required
// width without horizontal scroll or clipped content.
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Home / Dashboard"
        title="Warehouse Overview"
        actions={
          <button className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white">
            + New Receiving Sheet
          </button>
        }
      />
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
          Screen content is not implemented yet - this page exists only to
          verify the mobile-first app shell (sidebar, bottom nav, header)
          reflows correctly.
        </div>
      </div>
    </>
  );
}
