import { stockAgeBucket, stockAgeDays, type StockAgeBucket } from "./dashboard";

/**
 * FIFO Aging Report (TASK-013, SCREEN-013 - "Stock aging by batch, FIFO
 * compliance"). Pure aggregation helpers - no database access, so they
 * are testable without a live DB and reusable by both the API route and
 * its tests, same pattern as dashboard.ts.
 *
 * Re-exports dashboard.ts's own stockAgeBucket/stockAgeDays rather than
 * duplicating the 0-30/31-60/61-90/90+ boundaries - a real, disclosed
 * reuse (this report's own age concept, days since a batch's real
 * production_date, is exactly what INV-010/assertFifoOrderOrOverride
 * already compares picks against; the boundaries are the same
 * mockup-sourced numbers TASK-012 already established, applied here to
 * a different date field, not a new invented threshold).
 */
export { stockAgeBucket, stockAgeDays };
export type { StockAgeBucket };

export type AgingByBatchRow = {
  materialId: string;
  materialCode: string;
  batchId: string;
  batchNumber: string;
  productionDate: string;
  cartonQty: number;
};

export type AgingByBatchEntry = {
  batchId: string;
  batchNumber: string;
  materialCode: string;
  productionDate: string;
  ageDays: number;
  ageBucket: StockAgeBucket;
  totalCartons: number;
  palletCount: number;
};

/**
 * Groups currently-OK pallet_batches rows (the caller filters to
 * pallets.status_code = 'OK' - the only status FIFO picking actually
 * draws from, per loading-sheet.ts's own assertDispatchEligible) by
 * batch, sorted oldest production_date first - the same FIFO ordering
 * the pick screen's own "oldest first" select already uses.
 */
export function buildAgingByBatch(rows: AgingByBatchRow[], now: Date = new Date()): AgingByBatchEntry[] {
  const byBatch = new Map<string, AgingByBatchEntry>();
  for (const row of rows) {
    const existing = byBatch.get(row.batchId);
    if (existing) {
      existing.totalCartons += row.cartonQty;
      existing.palletCount += 1;
      continue;
    }
    const ageDays = stockAgeDays(row.productionDate, now);
    byBatch.set(row.batchId, {
      batchId: row.batchId,
      batchNumber: row.batchNumber,
      materialCode: row.materialCode,
      productionDate: row.productionDate,
      ageDays,
      ageBucket: stockAgeBucket(ageDays),
      totalCartons: row.cartonQty,
      palletCount: 1,
    });
  }
  return Array.from(byBatch.values()).sort((a, b) => a.productionDate.localeCompare(b.productionDate));
}

export type FifoComplianceResult = {
  totalDispatchedPicks: number;
  compliantPicks: number;
  overriddenPicks: number;
  // null (not 0, not 100) when there are no dispatched picks yet - a
  // real zero-denominator "no data" case, not "0% compliant" or "100%
  // compliant", either of which would misleadingly imply a real rate.
  compliancePct: number | null;
};

/**
 * "FIFO compliance rate (% dispatches following FIFO)" - Section 15.2's
 * own metric definition. Scoped to picks belonging to loading sheets
 * that actually reached DISPATCHED (the literal "dispatches" the metric
 * names, not every pick ever staged) - a pick is FIFO-compliant when its
 * own fifo_override_reason is null (no override was needed at pick
 * time, per assertFifoOrderOrOverride's own real enforcement).
 */
export function calculateFifoCompliance(dispatchedPickOverrideReasons: (string | null)[]): FifoComplianceResult {
  const totalDispatchedPicks = dispatchedPickOverrideReasons.length;
  const overriddenPicks = dispatchedPickOverrideReasons.filter((r) => r !== null && r.trim() !== "").length;
  const compliantPicks = totalDispatchedPicks - overriddenPicks;
  return {
    totalDispatchedPicks,
    compliantPicks,
    overriddenPicks,
    compliancePct: totalDispatchedPicks === 0 ? null : Math.round((compliantPicks / totalDispatchedPicks) * 1000) / 10,
  };
}
