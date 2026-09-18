"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";

type AgeBucketTone = "RED" | "AMBER" | "OK";

type DashboardData = {
  stockSnapshot: {
    totalCartons: number;
    totalPallets: number;
    byStatus: { status: string; cartons: number; palletCount: number }[];
    agingBuckets: { bucket: string; cartons: number; pct: number }[];
  };
  holdTracking:
    | { restricted: true }
    | { restricted: false; activeCount: number; totalCartons: number; red: number; amber: number; ok: number };
  bulkTracking: { count: number; pendingCartons: number; oldestDays: number };
  qcPendingQueue: { count: number; oldestHours: number };
  dispatchStatus: { dispatchedTotal: number; pendingCount: number };
  transfers: { inTransitCount: number; pendingReceiptCount: number };
  maintenance: { openCount: number; criticalCount: number; bySeverity: { severity: string; count: number }[] };
  rackMapMini: { coldRoom: string; total: number; occupied: number; occupiedPct: number }[];
  stockLedgerRecent:
    | { restricted: true }
    | {
        restricted: false;
        rows: {
          id: string;
          date: string;
          transactionType: string;
          materialCode: string;
          batchNumber: string;
          qtyChange: number;
          createdAt: string;
        }[];
      };
  inOutSummary:
    | { restricted: true }
    | {
        restricted: false;
        today: { shift: string; materialCode: string; inQty: number; outQty: number; netQty: number }[];
      };
};

type LoadState = "loading" | "ready" | "error";

// D-01/D-04/D-08's own spec'd refresh cadence is 30s (the fastest of the
// ten panels) - one shared poll at that interval for the whole page
// satisfies every panel's own stated interval (a 60s-spec'd panel
// refreshing every 30s is more current than spec'd, not a violation),
// which is simpler and more efficient than ten separate timers - a
// disclosed simplification of "Real-time refresh (30s/60s intervals)".
const REFRESH_MS = 30_000;

function ageBucketToneClass(tone: AgeBucketTone) {
  if (tone === "RED") return "bg-danger-light text-danger";
  if (tone === "AMBER") return "bg-warning-light text-warning";
  return "bg-line text-muted";
}

function severityToneClass(severity: string) {
  if (severity === "CRITICAL") return "bg-danger-light text-danger";
  if (severity === "HIGH") return "bg-warning-light text-warning";
  return "bg-line text-muted";
}

export default function DashboardPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/dashboard");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not load the dashboard.");
      setData(body as DashboardData);
      setLoadState("ready");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the dashboard.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const holdBucketTone: AgeBucketTone =
    data && !data.holdTracking.restricted && data.holdTracking.red > 0
      ? "RED"
      : data && !data.holdTracking.restricted && data.holdTracking.amber > 0
        ? "AMBER"
        : "OK";

  const isEmpty =
    loadState === "ready" &&
    data !== null &&
    data.stockSnapshot.totalPallets === 0 &&
    data.bulkTracking.count === 0 &&
    (data.holdTracking.restricted || data.holdTracking.activeCount === 0) &&
    data.maintenance.openCount === 0;

  return (
    <>
      <PageHeader
        breadcrumb="Home / Dashboard"
        title="Warehouse Overview"
        actions={
          <Link
            href="/inward/receiving-sheets"
            className="flex min-h-[48px] items-center rounded-lg bg-teal px-4 text-sm font-bold text-white"
          >
            + New Receiving Sheet
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {loadState === "loading" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Loading dashboard">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-line/40 shadow-card" />
            ))}
          </div>
        ) : loadState === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {loadError}
          </div>
        ) : isEmpty ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            No data for today yet - create a receiving sheet to begin.
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* D-01 Stock Snapshot */}
            <Panel title="Stock Snapshot">
              <div className="text-2xl font-extrabold text-navy">{data.stockSnapshot.totalCartons} ctn</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {data.stockSnapshot.byStatus.map((s) => (
                  <span key={s.status} className="rounded-full bg-line px-2 py-0.5 font-semibold text-ink2">
                    {s.status}: {s.cartons}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted">
                {data.stockSnapshot.agingBuckets.map((b) => (
                  <div key={b.bucket} className="flex justify-between">
                    <span>{b.bucket}</span>
                    <span className={b.bucket === "90+" && b.cartons > 0 ? "font-bold text-danger" : ""}>
                      {b.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* D-02 Hold Tracking */}
            <Panel title="Hold Tracking" action={<Link href="/holds" className={linkClass()}>View All Holds &rarr;</Link>}>
              {data.holdTracking.restricted ? (
                <RestrictedNotice />
              ) : (
                <>
                  <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-bold " + ageBucketToneClass(holdBucketTone)}>
                    {data.holdTracking.activeCount} active holds
                  </span>
                  <div className="mt-2 text-xs text-muted">{data.holdTracking.totalCartons} cartons on hold</div>
                  <div className="mt-2 flex gap-3 text-xs">
                    <span className="text-danger">Red &gt;7d: {data.holdTracking.red}</span>
                    <span className="text-warning">Amber &gt;3d: {data.holdTracking.amber}</span>
                    <span className="text-muted">OK: {data.holdTracking.ok}</span>
                  </div>
                </>
              )}
            </Panel>

            {/* D-03 Bulk Tracking */}
            <Panel title="Bulk Tracking" action={<Link href="/bulk" className={linkClass()}>View Bulk &rarr;</Link>}>
              <div className="text-2xl font-extrabold text-navy">{data.bulkTracking.pendingCartons} ctn</div>
              <div className="mt-1 text-xs text-muted">
                {data.bulkTracking.count} pallets pending - oldest {data.bulkTracking.oldestDays}d
              </div>
            </Panel>

            {/* D-04 QC Pending Queue */}
            <Panel title="QC Pending Queue">
              <div className="text-2xl font-extrabold text-navy">{data.qcPendingQueue.count} pending</div>
              <div className="mt-1 text-xs text-muted">
                Oldest {data.qcPendingQueue.oldestHours}h - SLA timer visible only, no fixed target (see
                docs/PENDING_ITEMS.md)
              </div>
            </Panel>

            {/* D-05 Dispatch Status */}
            <Panel title="Dispatch Status">
              <div className="flex gap-4">
                <div>
                  <div className="text-2xl font-extrabold text-navy">{data.dispatchStatus.dispatchedTotal}</div>
                  <div className="text-xs text-muted">Dispatched</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-navy">{data.dispatchStatus.pendingCount}</div>
                  <div className="text-xs text-muted">Pending</div>
                </div>
              </div>
            </Panel>

            {/* D-06 Transfers */}
            <Panel title="Transfers" action={<Link href="/transfers" className={linkClass()}>View &rarr;</Link>}>
              <div className="flex gap-4">
                <div>
                  <div className="text-2xl font-extrabold text-navy">{data.transfers.inTransitCount}</div>
                  <div className="text-xs text-muted">In-Transit</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-navy">{data.transfers.pendingReceiptCount}</div>
                  <div className="text-xs text-muted">Pending Receipt</div>
                </div>
              </div>
            </Panel>

            {/* D-07 Maintenance */}
            <Panel title="Maintenance" action={<Link href="/maintenance" className={linkClass()}>View &rarr;</Link>}>
              <div className="text-2xl font-extrabold text-navy">{data.maintenance.openCount} open</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {data.maintenance.bySeverity.map((s) => (
                  <span key={s.severity} className={"rounded-full px-2 py-0.5 font-bold " + severityToneClass(s.severity)}>
                    {s.severity}: {s.count}
                  </span>
                ))}
              </div>
            </Panel>

            {/* D-08 Rack Map (mini) */}
            <Panel title="Rack Map (mini)" action={<Link href="/storage/rack-map" className={linkClass()}>View Full Rack Map &rarr;</Link>}>
              <div className="space-y-1 text-xs">
                {data.rackMapMini.map((r) => (
                  <div key={r.coldRoom} className="flex justify-between">
                    <span className="font-semibold text-navy">{r.coldRoom}</span>
                    <span className="text-muted">
                      {r.occupied}/{r.total} occupied ({r.occupiedPct}%)
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* D-09 Stock Ledger (recent) */}
            <Panel title="Stock Ledger (recent)" action={<Link href="/stock/ledger" className={linkClass()}>View Full Ledger &rarr;</Link>}>
              {data.stockLedgerRecent.restricted ? (
                <RestrictedNotice />
              ) : data.stockLedgerRecent.rows.length === 0 ? (
                <div className="text-xs text-muted">No transactions yet.</div>
              ) : (
                <div className="space-y-1 text-xs">
                  {data.stockLedgerRecent.rows.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex justify-between border-b border-line py-1 last:border-0">
                      <span className="font-semibold text-navy">{r.transactionType}</span>
                      <span className="text-muted">
                        {r.materialCode} - {r.batchNumber}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* D-10 In-Out Summary */}
            <Panel title="In-Out Summary (today)" action={<Link href="/stock/in-out-summary" className={linkClass()}>View &rarr;</Link>}>
              {data.inOutSummary.restricted ? (
                <RestrictedNotice />
              ) : data.inOutSummary.today.length === 0 ? (
                <div className="text-xs text-muted">No IN/OUT movement today yet.</div>
              ) : (
                <div className="space-y-1 text-xs">
                  {data.inOutSummary.today.slice(0, 5).map((row, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="font-semibold text-navy">
                        {row.shift} - {row.materialCode}
                      </span>
                      <span className="text-muted">
                        IN {row.inQty} / OUT {row.outQty}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RestrictedNotice() {
  return <div className="text-xs text-muted">Your role does not have permission to view this panel.</div>;
}

function linkClass() {
  return "text-xs font-semibold text-teal underline";
}
