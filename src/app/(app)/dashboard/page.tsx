"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, KpiCard } from "@/components/ui";

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
  warehouseWiseStock: { warehouseCode: string; warehouseName: string; cartons: number; pct: number }[];
  dailyFlow: { date: string; inward: number; dispatch: number }[];
  topAgedHolds:
    | { restricted: true }
    | {
        restricted: false;
        rows: {
          id: string;
          materialCode: string;
          holdReason: string;
          totalCartons: number;
          placedAt: string;
          ageDays: number;
          ageBucket: string;
        }[];
      };
  todaysDispatch: { id: string; vehicleNumber: string; partyName: string; status: string; totalCartons: number }[];
};

type LoadState = "loading" | "ready" | "error";

// D-01/D-04/D-08's own spec'd refresh cadence is 30s (the fastest of the
// ten panels) - one shared poll at that interval for the whole page
// satisfies every panel's own stated interval, a disclosed simplification
// of "Real-time refresh (30s/60s intervals)" kept from TASK-012's own
// original build.
const REFRESH_MS = 30_000;

const STATUS_COLORS: Record<string, string> = {
  OK: "#059669",
  HOLD: "#D97706",
  QC_HOLD: "#0284C7",
  BULK: "#7C3AED",
  REJECTED: "#DC2626",
  IN_TRANSIT: "#2563EB",
  CUSTOMER_SAMPLE: "#94A3B8",
  SAMPLE: "#94A3B8",
};

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
      <div className="flex flex-col gap-5 bg-canvas p-4 sm:p-6">
        {loadState === "loading" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Loading dashboard">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-line/40 shadow-card" />
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
          <>
            {/* KPI row - real numbers only, no invented trend sparklines
                (no per-metric history is tracked anywhere in this app). */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                color="#059669"
                label="OK / Available"
                value={data.stockSnapshot.byStatus.find((s) => s.status === "OK")?.cartons ?? 0}
                sub="cartons"
              />
              <KpiCard
                color="#DC2626"
                label="On Hold"
                value={data.holdTracking.restricted ? "—" : data.holdTracking.activeCount}
                sub={data.holdTracking.restricted ? "restricted" : `${data.holdTracking.totalCartons} ctn`}
              />
              <KpiCard color="#D97706" label="QC Pending" value={data.qcPendingQueue.count} sub="pallets" />
              <KpiCard color="#7C3AED" label="Bulk Pending" value={data.bulkTracking.pendingCartons} sub="cartons" />
              <KpiCard color="#2563EB" label="Dispatched" value={data.dispatchStatus.dispatchedTotal} sub={`${data.dispatchStatus.pendingCount} pending`} />
              <KpiCard
                color="#EF4444"
                label="Maintenance"
                value={data.maintenance.openCount}
                sub={data.maintenance.criticalCount > 0 ? `${data.maintenance.criticalCount} CRITICAL` : "open"}
                subTone={data.maintenance.criticalCount > 0 ? "danger" : "muted"}
              />
            </div>

            {/* Stock status donut + 14-day flow */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card title="Stock Status Breakdown" sub="by cartons" action={<Link href="/stock/ledger" className={linkClass()}>Ledger &rarr;</Link>}>
                <StockDonut byStatus={data.stockSnapshot.byStatus} totalCartons={data.stockSnapshot.totalCartons} />
              </Card>
              <Card title="14-Day Flow" sub="inward vs dispatch">
                <DailyFlowChart rows={data.dailyFlow} />
              </Card>
            </div>

            {/* FIFO aging + warehouse-wise + ops snapshot */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="FIFO Aging" sub={`${data.stockSnapshot.totalCartons} cartons`}>
                <FifoAgingBar buckets={data.stockSnapshot.agingBuckets} />
              </Card>
              <Card title="Warehouse-wise Stock" action={<Link href="/transfers" className={linkClass()}>View &rarr;</Link>}>
                <WarehouseStockBars rows={data.warehouseWiseStock} />
              </Card>
              <Card title="Operations Snapshot" sub="rack map + transfers">
                <div className="space-y-2.5 text-xs">
                  {data.rackMapMini.map((r) => (
                    <div key={r.coldRoom} className="flex items-center justify-between">
                      <span className="font-semibold text-navy">{r.coldRoom}</span>
                      <div className="flex-1 mx-2 h-2 rounded-full bg-line">
                        <div className="h-2 rounded-full bg-sky" style={{ width: `${r.occupiedPct}%` }} />
                      </div>
                      <span className="text-muted">{r.occupied}/{r.total}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-line pt-2">
                    <span className="text-muted">In-Transit</span>
                    <span className="font-bold text-navy">{data.transfers.inTransitCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Pending Receipt</span>
                    <span className="font-bold text-navy">{data.transfers.pendingReceiptCount}</span>
                  </div>
                  {data.maintenance.bySeverity.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                      {data.maintenance.bySeverity.map((s) => (
                        <span key={s.severity} className={"rounded-full px-2 py-0.5 font-bold " + severityToneClass(s.severity)}>
                          {s.severity}: {s.count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>

            {/* Hold aging + today's dispatch */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card
                title="Hold Aging - Action Required"
                accentColor="#D97706"
                action={<Link href="/holds" className={linkClass()}>View All Holds &rarr;</Link>}
              >
                {data.topAgedHolds.restricted ? (
                  <RestrictedNotice />
                ) : data.topAgedHolds.rows.length === 0 ? (
                  <div className="text-xs text-muted">No active holds right now.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-left text-xs">
                      <thead>
                        <tr className="text-muted2">
                          <th className="pb-2 font-bold uppercase tracking-wide">Material</th>
                          <th className="pb-2 font-bold uppercase tracking-wide">Reason</th>
                          <th className="pb-2 font-bold uppercase tracking-wide">Qty</th>
                          <th className="pb-2 text-center font-bold uppercase tracking-wide">Aging</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {data.topAgedHolds.rows.map((h) => (
                          <tr key={h.id}>
                            <td className="py-2 font-bold text-ink">{h.materialCode}</td>
                            <td className="py-2 text-ink2">{h.holdReason}</td>
                            <td className="py-2 text-ink2">{h.totalCartons} ctn</td>
                            <td className="py-2 text-center">
                              <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + ageBucketToneClass(h.ageBucket as AgeBucketTone)}>
                                {h.ageDays}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card title="Today's Dispatch" action={<Link href="/outward/loading-sheets" className={linkClass()}>Dispatch desk &rarr;</Link>}>
                {data.todaysDispatch.length === 0 ? (
                  <div className="text-xs text-muted">No dispatch activity today yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[380px] text-left text-xs">
                      <thead>
                        <tr className="text-muted2">
                          <th className="pb-2 font-bold uppercase tracking-wide">Vehicle</th>
                          <th className="pb-2 font-bold uppercase tracking-wide">Party</th>
                          <th className="pb-2 font-bold uppercase tracking-wide">Qty</th>
                          <th className="pb-2 font-bold uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {data.todaysDispatch.map((d) => (
                          <tr key={d.id}>
                            <td className="py-2 font-bold text-ink">{d.vehicleNumber}</td>
                            <td className="py-2 text-ink2">{d.partyName}</td>
                            <td className="py-2 text-ink2">{d.totalCartons} ctn</td>
                            <td className="py-2">
                              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-ink2">{d.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            {/* Stock ledger recent + in-out summary */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Stock Ledger (recent)" action={<Link href="/stock/ledger" className={linkClass()}>View Full Ledger &rarr;</Link>}>
                {data.stockLedgerRecent.restricted ? (
                  <RestrictedNotice />
                ) : data.stockLedgerRecent.rows.length === 0 ? (
                  <div className="text-xs text-muted">No transactions yet.</div>
                ) : (
                  <div className="space-y-1 text-xs">
                    {data.stockLedgerRecent.rows.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex justify-between border-b border-line py-1.5 last:border-0">
                        <span className="font-semibold text-navy">{r.transactionType}</span>
                        <span className="text-muted">{r.materialCode} - {r.batchNumber}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="In-Out Summary (today)" action={<Link href="/stock/in-out-summary" className={linkClass()}>View &rarr;</Link>}>
                {data.inOutSummary.restricted ? (
                  <RestrictedNotice />
                ) : data.inOutSummary.today.length === 0 ? (
                  <div className="text-xs text-muted">No IN/OUT movement today yet.</div>
                ) : (
                  <div className="space-y-1 text-xs">
                    {data.inOutSummary.today.slice(0, 5).map((row, i) => (
                      <div key={i} className="flex justify-between border-b border-line py-1.5 last:border-0">
                        <span className="font-semibold text-navy">{row.shift} - {row.materialCode}</span>
                        <span className="text-muted">IN {row.inQty} / OUT {row.outQty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function RestrictedNotice() {
  return <div className="text-xs text-muted">Your role does not have permission to view this panel.</div>;
}

function linkClass() {
  return "text-xs font-semibold text-teal underline";
}

// ---- Real SVG charts, computed from real data - no fabricated numbers ----

function StockDonut({
  byStatus,
  totalCartons,
}: {
  byStatus: { status: string; cartons: number; palletCount: number }[];
  totalCartons: number;
}) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = useMemo(
    () =>
      byStatus.map((s) => {
        const frac = totalCartons === 0 ? 0 : s.cartons / totalCartons;
        const dash = frac * circumference;
        const seg = { ...s, dash, offset: -offset, color: STATUS_COLORS[s.status] ?? "#64748B" };
        offset += dash;
        return seg;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byStatus, totalCartons]
  );

  if (totalCartons === 0) {
    return <div className="text-xs text-muted">No current stock yet.</div>;
  }

  return (
    <div className="flex items-center gap-5">
      <svg width="150" height="150" viewBox="0 0 130 130" className="shrink-0">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#f1f5f9" strokeWidth="17" />
        {segments.map((s) => (
          <circle
            key={s.status}
            cx="65"
            cy="65"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="17"
            strokeDasharray={`${s.dash} ${circumference}`}
            strokeDashoffset={s.offset}
            transform="rotate(-90 65 65)"
          />
        ))}
        <text x="65" y="60" textAnchor="middle" fontSize="19" fontWeight="800" fill="#0f172a">
          {totalCartons}
        </text>
        <text x="65" y="75" textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8" letterSpacing="1">
          CARTONS
        </text>
      </svg>
      <div className="flex-1 space-y-1.5 text-xs">
        {byStatus.map((s) => (
          <div key={s.status} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-ink2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[s.status] ?? "#64748B" }} />
              {s.status}
            </span>
            <span className="text-muted2">
              {s.cartons} ({totalCartons === 0 ? 0 : Math.round((s.cartons / totalCartons) * 1000) / 10}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyFlowChart({ rows }: { rows: { date: string; inward: number; dispatch: number }[] }) {
  if (rows.length === 0) return <div className="text-xs text-muted">No ledger activity in this window.</div>;

  const max = Math.max(1, ...rows.map((r) => Math.max(r.inward, r.dispatch)));
  const width = 600;
  const height = 170;
  const padLeft = 8;
  const padRight = 8;
  const padBottom = 22;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padBottom;
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;

  function point(value: number, i: number) {
    const x = padLeft + step * i;
    const y = plotHeight - (value / max) * (plotHeight - 10);
    return [x, y] as const;
  }

  const inwardPoints = rows.map((r, i) => point(r.inward, i));
  const dispatchPoints = rows.map((r, i) => point(r.dispatch, i));
  const inwardLine = inwardPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join("");
  const dispatchLine = dispatchPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join("");
  const inwardArea = `${inwardLine}L${inwardPoints[inwardPoints.length - 1][0]},${plotHeight}L${inwardPoints[0][0]},${plotHeight}Z`;

  return (
    <div>
      <div className="mb-1 flex items-center gap-3 text-[11px] font-semibold text-ink2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal" />
          Inward
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
          Dispatch
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashFlowGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0D9488" stopOpacity=".28" />
            <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padLeft} y1={plotHeight} x2={width - padRight} y2={plotHeight} stroke="#f1f5f9" strokeWidth="1" />
        <path d={inwardArea} fill="url(#dashFlowGradient)" />
        <path d={inwardLine} fill="none" stroke="#0D9488" strokeWidth="2.4" strokeLinecap="round" />
        <path d={dispatchLine} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        <text x={padLeft} y={height - 4} fontSize="9.5" fill="#94a3b8" fontWeight="600">
          {rows[0].date.slice(5)}
        </text>
        <text x={width - padRight} y={height - 4} textAnchor="end" fontSize="9.5" fill="#94a3b8" fontWeight="600">
          {rows[rows.length - 1].date.slice(5)}
        </text>
      </svg>
    </div>
  );
}

function FifoAgingBar({ buckets }: { buckets: { bucket: string; cartons: number; pct: number }[] }) {
  const colors: Record<string, string> = {
    "0-30": "linear-gradient(135deg,#34D399,#059669)",
    "31-60": "linear-gradient(135deg,#60A5FA,#2563EB)",
    "61-90": "linear-gradient(135deg,#FBBF24,#D97706)",
    "90+": "linear-gradient(135deg,#F87171,#DC2626)",
  };
  const total = buckets.reduce((sum, b) => sum + b.cartons, 0);
  const overNinety = buckets.find((b) => b.bucket === "90+");

  if (total === 0) return <div className="text-xs text-muted">No current stock yet.</div>;

  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg text-[10px] font-bold text-white shadow-card">
        {buckets
          .filter((b) => b.pct > 0)
          .map((b) => (
            <div
              key={b.bucket}
              className="flex items-center justify-center"
              style={{ width: `${b.pct}%`, background: colors[b.bucket] }}
              title={`${b.bucket}d: ${b.cartons} ctn`}
            >
              {b.pct > 8 ? `${b.bucket}d` : ""}
            </div>
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {buckets.map((b) => (
          <span key={b.bucket}>
            {b.bucket}d: <b className="text-ink2">{b.cartons}</b>
          </span>
        ))}
      </div>
      {overNinety && overNinety.cartons > 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-warning bg-warning-light/40 px-3 py-2 text-[11px] text-warning">
          ⚠ {overNinety.cartons} cartons over 90 days old - priority dispatch or QC re-review.
        </div>
      ) : null}
    </div>
  );
}

function WarehouseStockBars({ rows }: { rows: { warehouseCode: string; warehouseName: string; cartons: number; pct: number }[] }) {
  if (rows.length === 0) return <div className="text-xs text-muted">No current stock yet.</div>;
  const max = Math.max(...rows.map((r) => r.cartons), 1);
  return (
    <div className="space-y-2.5 text-xs">
      {rows.map((r) => (
        <div key={r.warehouseCode} className="grid grid-cols-[80px_1fr_50px] items-center gap-2">
          <span className="truncate font-bold text-navy">{r.warehouseName}</span>
          <div className="h-3.5 rounded bg-canvas">
            <div
              className="h-3.5 rounded"
              style={{
                width: `${Math.max(4, (r.cartons / max) * 100)}%`,
                background: "linear-gradient(90deg,#0D9488,#0F766E)",
              }}
            />
          </div>
          <span className="text-right font-semibold text-ink2">{r.cartons}</span>
        </div>
      ))}
    </div>
  );
}
