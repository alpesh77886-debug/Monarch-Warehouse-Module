import { describe, expect, it } from "vitest";
import { assertBulkReasonConsistency, bulkAgeDays, bulkAgeBucket, BULK_REASONS } from "@/lib/business-rules/bulk";

describe("BULK_REASONS", () => {
  it("has exactly the two bulk-specific hold reasons, transcribed from ENTITY-011", () => {
    expect(BULK_REASONS).toEqual(["Over-production (bulk)", "Defective fries (bulk)"]);
  });
});

describe("assertBulkReasonConsistency", () => {
  it("requires a bulk reason when defaultPalletStatus is BULK", () => {
    expect(() => assertBulkReasonConsistency("BULK", null)).toThrow(/required/i);
    expect(() => assertBulkReasonConsistency("BULK", undefined)).toThrow(/required/i);
    expect(() => assertBulkReasonConsistency("BULK", "")).toThrow(/required/i);
    expect(() => assertBulkReasonConsistency("BULK", "   ")).toThrow(/required/i);
  });

  it("accepts either fixed bulk reason when defaultPalletStatus is BULK", () => {
    expect(() => assertBulkReasonConsistency("BULK", "Over-production (bulk)")).not.toThrow();
    expect(() => assertBulkReasonConsistency("BULK", "Defective fries (bulk)")).not.toThrow();
  });

  it("rejects a free-text reason not in the fixed dropdown", () => {
    expect(() => assertBulkReasonConsistency("BULK", "just because")).toThrow(/dropdown/i);
  });

  it("rejects a bulk reason on a non-BULK sheet", () => {
    expect(() => assertBulkReasonConsistency("QC_HOLD", "Over-production (bulk)")).toThrow(/only allowed/i);
  });

  it("allows no reason on a non-BULK sheet", () => {
    expect(() => assertBulkReasonConsistency("QC_HOLD", null)).not.toThrow();
    expect(() => assertBulkReasonConsistency("QC_HOLD", undefined)).not.toThrow();
  });
});

describe("bulkAgeDays / bulkAgeBucket", () => {
  it("computes whole days since createdAt", () => {
    const now = new Date("2026-02-10T12:00:00.000Z");
    expect(bulkAgeDays("2026-02-10T06:00:00.000Z", now)).toBe(0);
    expect(bulkAgeDays("2026-02-07T12:00:00.000Z", now)).toBe(3);
    expect(bulkAgeDays("2026-02-01T12:00:00.000Z", now)).toBe(9);
  });

  it("never returns a negative age for a future timestamp", () => {
    const now = new Date("2026-02-10T12:00:00.000Z");
    expect(bulkAgeDays("2026-02-15T12:00:00.000Z", now)).toBe(0);
  });

  it("buckets at the same boundary Hold Management uses (>3d amber, >7d red)", () => {
    expect(bulkAgeBucket(0)).toBe("OK");
    expect(bulkAgeBucket(3)).toBe("OK");
    expect(bulkAgeBucket(4)).toBe("AMBER");
    expect(bulkAgeBucket(7)).toBe("AMBER");
    expect(bulkAgeBucket(8)).toBe("RED");
  });
});
