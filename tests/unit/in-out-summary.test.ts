import { describe, expect, it } from "vitest";
import {
  aggregateInOut,
  directionForTransactionType,
  IN_TRANSACTION_TYPES,
  OUT_TRANSACTION_TYPES,
  type InOutLedgerRow,
} from "../../src/lib/business-rules/in-out-summary";

describe("directionForTransactionType (PEN-031)", () => {
  it("classifies every IN type", () => {
    for (const t of IN_TRANSACTION_TYPES) {
      expect(directionForTransactionType(t)).toBe("IN");
    }
  });

  it("classifies every OUT type", () => {
    for (const t of OUT_TRANSACTION_TYPES) {
      expect(directionForTransactionType(t)).toBe("OUT");
    }
  });

  it("classifies status-only transitions as neither IN nor OUT", () => {
    expect(directionForTransactionType("HOLD")).toBeNull();
    expect(directionForTransactionType("RELEASE")).toBeNull();
    expect(directionForTransactionType("MOVE")).toBeNull();
    expect(directionForTransactionType("ADJUSTMENT")).toBeNull();
  });
});

describe("aggregateInOut", () => {
  const rows: InOutLedgerRow[] = [
    { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "INWARD", qtyChange: 60 },
    { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "INWARD", qtyChange: 40 },
    { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "DISPATCH", qtyChange: -30 },
    { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "HOLD", qtyChange: 0 },
    { date: "2026-09-15", shift: "B", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "INWARD", qtyChange: 20 },
    { date: "2026-09-15", shift: "A", materialCode: "LFG00002", materialDescription: "Fries B", transactionType: "TRANSFER_IN", qtyChange: 15 },
  ];

  it("sums IN and OUT quantities per (date, shift, material), ignoring status-only rows", () => {
    const summary = aggregateInOut(rows);
    const key1 = summary.find((s) => s.materialCode === "LFG00001" && s.shift === "A");
    expect(key1).toBeDefined();
    expect(key1!.inQty).toBe(100); // 60 + 40
    expect(key1!.outQty).toBe(30); // abs(-30)
    expect(key1!.netQty).toBe(70);
  });

  it("keeps different shifts and materials as separate rows", () => {
    const summary = aggregateInOut(rows);
    expect(summary).toHaveLength(3); // (A, LFG00001), (B, LFG00001), (A, LFG00002)
    const key2 = summary.find((s) => s.materialCode === "LFG00001" && s.shift === "B");
    expect(key2!.inQty).toBe(20);
    expect(key2!.outQty).toBe(0);
  });

  it("sorts by date, then shift, then material code", () => {
    const summary = aggregateInOut(rows);
    expect(summary.map((s) => `${s.date}|${s.shift}|${s.materialCode}`)).toEqual([
      "2026-09-15|A|LFG00001",
      "2026-09-15|A|LFG00002",
      "2026-09-15|B|LFG00001",
    ]);
  });

  it("produces no rows at all when only status-only transactions exist", () => {
    const summary = aggregateInOut([
      { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "HOLD", qtyChange: 0 },
      { date: "2026-09-15", shift: "A", materialCode: "LFG00001", materialDescription: "Fries A", transactionType: "RELEASE", qtyChange: 0 },
    ]);
    expect(summary).toHaveLength(0);
  });
});
