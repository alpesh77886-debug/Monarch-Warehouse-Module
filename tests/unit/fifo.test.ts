import { describe, expect, it } from "vitest";
import { buildAgingByBatch, calculateFifoCompliance, type AgingByBatchRow } from "../../src/lib/business-rules/fifo";

describe("buildAgingByBatch (TASK-013, SCREEN-013)", () => {
  const now = new Date("2026-09-18T00:00:00.000Z");

  it("groups multiple pallet_batches rows of the same batch into one entry, summing cartons and pallets", () => {
    const rows: AgingByBatchRow[] = [
      { materialId: "m1", materialCode: "LFG00001", batchId: "b1", batchNumber: "L26I001010", productionDate: "2026-08-01", cartonQty: 40 },
      { materialId: "m1", materialCode: "LFG00001", batchId: "b1", batchNumber: "L26I001010", productionDate: "2026-08-01", cartonQty: 25 },
    ];
    const result = buildAgingByBatch(rows, now);
    expect(result).toHaveLength(1);
    expect(result[0].totalCartons).toBe(65);
    expect(result[0].palletCount).toBe(2);
  });

  it("computes age in days from the batch's real production date, and buckets it", () => {
    const rows: AgingByBatchRow[] = [
      { materialId: "m1", materialCode: "LFG00001", batchId: "b-fresh", batchNumber: "FRESH", productionDate: "2026-09-10", cartonQty: 10 },
      { materialId: "m1", materialCode: "LFG00001", batchId: "b-old", batchNumber: "OLD", productionDate: "2026-05-01", cartonQty: 10 },
    ];
    const result = buildAgingByBatch(rows, now);
    const fresh = result.find((r) => r.batchId === "b-fresh")!;
    const old = result.find((r) => r.batchId === "b-old")!;
    expect(fresh.ageDays).toBe(8);
    expect(fresh.ageBucket).toBe("0-30");
    expect(old.ageDays).toBeGreaterThan(90);
    expect(old.ageBucket).toBe("90+");
  });

  it("sorts oldest production date first - the same FIFO order the pick screen's own select uses", () => {
    const rows: AgingByBatchRow[] = [
      { materialId: "m1", materialCode: "LFG00001", batchId: "b-new", batchNumber: "NEW", productionDate: "2026-09-01", cartonQty: 10 },
      { materialId: "m1", materialCode: "LFG00001", batchId: "b-older", batchNumber: "OLDER", productionDate: "2026-07-01", cartonQty: 10 },
    ];
    const result = buildAgingByBatch(rows, now);
    expect(result.map((r) => r.batchId)).toEqual(["b-older", "b-new"]);
  });

  it("returns an empty list for no rows", () => {
    expect(buildAgingByBatch([], now)).toEqual([]);
  });
});

describe("calculateFifoCompliance (TASK-013, Section 15.2 metric)", () => {
  it("returns null compliancePct with zero dispatched picks - not 0% or 100%", () => {
    const result = calculateFifoCompliance([]);
    expect(result.totalDispatchedPicks).toBe(0);
    expect(result.compliancePct).toBeNull();
  });

  it("counts a null fifo_override_reason as FIFO-compliant", () => {
    const result = calculateFifoCompliance([null, null, null, null]);
    expect(result.compliantPicks).toBe(4);
    expect(result.overriddenPicks).toBe(0);
    expect(result.compliancePct).toBe(100);
  });

  it("counts a non-empty fifo_override_reason as an override, not compliant", () => {
    const result = calculateFifoCompliance([null, null, null, "Older batch quarantined"]);
    expect(result.totalDispatchedPicks).toBe(4);
    expect(result.compliantPicks).toBe(3);
    expect(result.overriddenPicks).toBe(1);
    expect(result.compliancePct).toBe(75);
  });

  it("treats an empty/whitespace-only reason the same as no override (defensive - should never happen given INV-010's own enforcement)", () => {
    const result = calculateFifoCompliance([null, "   "]);
    expect(result.overriddenPicks).toBe(0);
    expect(result.compliancePct).toBe(100);
  });
});
