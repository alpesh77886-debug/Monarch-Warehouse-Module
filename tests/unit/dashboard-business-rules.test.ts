import { describe, expect, it } from "vitest";
import { buildWarehouseWiseStock, buildDailyFlow } from "../../src/lib/business-rules/dashboard";

describe("buildWarehouseWiseStock (Loop 50 dashboard redesign)", () => {
  it("sums cartons per warehouse and computes a real percentage share", () => {
    const rows = [
      { warehouseCode: "LIMBASI-FG", warehouseName: "Limbasi", totalCartons: 300 },
      { warehouseCode: "LIMBASI-FG", warehouseName: "Limbasi", totalCartons: 200 },
      { warehouseCode: "SABARKANTHA-FG", warehouseName: "Sabarkantha", totalCartons: 500 },
    ];
    const result = buildWarehouseWiseStock(rows);
    // A real tie (both 500) - sort is stable, so insertion order (Limbasi
    // first) is preserved rather than an arbitrary comparator outcome.
    expect(result).toEqual([
      { warehouseCode: "LIMBASI-FG", warehouseName: "Limbasi", cartons: 500, pct: 50 },
      { warehouseCode: "SABARKANTHA-FG", warehouseName: "Sabarkantha", cartons: 500, pct: 50 },
    ]);
  });

  it("returns an empty array, not a divide-by-zero crash, for zero rows", () => {
    expect(buildWarehouseWiseStock([])).toEqual([]);
  });
});

describe("buildDailyFlow (Loop 50 dashboard redesign)", () => {
  it("buckets real ledger rows into inward/dispatch per real calendar day, over the requested window", () => {
    const rows = [
      { date: "2026-09-10", transactionType: "INWARD", qtyChange: 100 },
      { date: "2026-09-10", transactionType: "DISPATCH", qtyChange: -40 },
      { date: "2026-09-11", transactionType: "TRANSFER_IN", qtyChange: 20 },
      { date: "2026-09-11", transactionType: "HOLD", qtyChange: 0 }, // neither IN nor OUT - excluded
      { date: "2026-08-01", transactionType: "INWARD", qtyChange: 999 }, // outside the window
    ];
    const result = buildDailyFlow(rows, 3, new Date("2026-09-11T12:00:00.000Z"));
    expect(result).toEqual([
      { date: "2026-09-09", inward: 0, dispatch: 0 },
      { date: "2026-09-10", inward: 100, dispatch: 40 },
      { date: "2026-09-11", inward: 20, dispatch: 0 },
    ]);
  });

  it("returns exactly `days` entries even with zero real rows", () => {
    const result = buildDailyFlow([], 14, new Date("2026-09-12T00:00:00.000Z"));
    expect(result).toHaveLength(14);
    expect(result.every((d) => d.inward === 0 && d.dispatch === 0)).toBe(true);
    expect(result[13].date).toBe("2026-09-12");
    expect(result[0].date).toBe("2026-08-30");
  });
});
