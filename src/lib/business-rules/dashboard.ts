/**
 * Dashboard (TASK-012, SCREEN-001). Pure aggregation helpers - no
 * database access, so they are testable without a live DB and reusable
 * by both the API route and its tests.
 */

export type StockAgeBucket = "0-30" | "31-60" | "61-90" | "90+";

/**
 * SCREEN-001's own mockup is the only source that names concrete
 * day-boundaries for stock aging (its example rows read "0-30 / 31-60 /
 * 61-90 / 90+"), unlike Hold/Bulk's already-built >3d/>7d thresholds,
 * which track how long a pallet has been ON HOLD, a different question
 * from how long stock has existed at all. Transcribed directly from
 * that mockup, not invented - the reference is visual-only for layout,
 * but the day-boundaries themselves are real numbers it states, not a
 * layout choice.
 */
export function stockAgeDays(createdAt: string, now: Date = new Date()): number {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function stockAgeBucket(days: number): StockAgeBucket {
  if (days > 90) return "90+";
  if (days > 60) return "61-90";
  if (days > 30) return "31-60";
  return "0-30";
}

/**
 * Pallet status codes that represent stock no longer physically present
 * in a warehouse - excluded from "current stock" totals (Stock Snapshot,
 * aging buckets). Every other status_code (including IN_TRANSIT, which
 * is still owned inventory, just between locations) counts as current
 * stock - not narrowed to only the mockup's 4 example lines (OK/Hold/
 * Bulk/Rejected), since every real status is real data worth showing,
 * not an invented omission.
 */
export const STOCK_SNAPSHOT_EXCLUDED_STATUSES = ["DISPATCHED", "SCRAP"] as const;

export type StockStatusBreakdown = { status: string; cartons: number; palletCount: number };

export type StockSnapshotPalletRow = { statusCode: string; totalCartons: number; createdAt: string };

export type StockSnapshot = {
  totalCartons: number;
  totalPallets: number;
  byStatus: StockStatusBreakdown[];
  agingBuckets: { bucket: StockAgeBucket; cartons: number; pct: number }[];
};

export function buildStockSnapshot(rows: StockSnapshotPalletRow[], now: Date = new Date()): StockSnapshot {
  const current = rows.filter(
    (r) => !(STOCK_SNAPSHOT_EXCLUDED_STATUSES as readonly string[]).includes(r.statusCode)
  );

  const byStatusMap = new Map<string, StockStatusBreakdown>();
  const bucketMap = new Map<StockAgeBucket, number>([
    ["0-30", 0],
    ["31-60", 0],
    ["61-90", 0],
    ["90+", 0],
  ]);

  let totalCartons = 0;
  for (const row of current) {
    totalCartons += row.totalCartons;

    const status = byStatusMap.get(row.statusCode) ?? { status: row.statusCode, cartons: 0, palletCount: 0 };
    status.cartons += row.totalCartons;
    status.palletCount += 1;
    byStatusMap.set(row.statusCode, status);

    const bucket = stockAgeBucket(stockAgeDays(row.createdAt, now));
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + row.totalCartons);
  }

  return {
    totalCartons,
    totalPallets: current.length,
    byStatus: Array.from(byStatusMap.values()).sort((a, b) => b.cartons - a.cartons),
    agingBuckets: (["0-30", "31-60", "61-90", "90+"] as StockAgeBucket[]).map((bucket) => {
      const cartons = bucketMap.get(bucket) ?? 0;
      return { bucket, cartons, pct: totalCartons === 0 ? 0 : Math.round((cartons / totalCartons) * 1000) / 10 };
    }),
  };
}

export type RackMiniRow = { coldRoom: string; status: string };

export type RackMiniSummary = { coldRoom: string; total: number; occupied: number; occupiedPct: number };

/**
 * D-08's mini occupancy %, grouped by cold_room (the real CHECK-
 * constrained zone field - CR1/CR2/FLOOR/NA). PARTIAL counts as
 * occupied (the location has real stock in it, just not at capacity) -
 * only EMPTY is free; BLOCKED is neither free nor real stock, but is
 * still "not available", so it is counted as occupied for this simple
 * %-occupied reading rather than invented a third bucket the mockup's
 * own single-number-per-room summary has no room for.
 */
export function buildRackMiniSummary(rows: RackMiniRow[]): RackMiniSummary[] {
  const byRoom = new Map<string, { total: number; occupied: number }>();
  for (const row of rows) {
    const entry = byRoom.get(row.coldRoom) ?? { total: 0, occupied: 0 };
    entry.total += 1;
    if (row.status !== "EMPTY") entry.occupied += 1;
    byRoom.set(row.coldRoom, entry);
  }
  return Array.from(byRoom.entries())
    .map(([coldRoom, { total, occupied }]) => ({
      coldRoom,
      total,
      occupied,
      occupiedPct: total === 0 ? 0 : Math.round((occupied / total) * 1000) / 10,
    }))
    .sort((a, b) => a.coldRoom.localeCompare(b.coldRoom));
}
