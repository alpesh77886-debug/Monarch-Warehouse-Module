import { describe, expect, it } from "vitest";
import {
  validatePalletStatusTransition,
  findTransition,
  describeLedgerEntry,
  PALLET_STATUSES,
} from "../../src/lib/workflows/pallet-status";
import { ValidationError, ForbiddenError } from "../../src/lib/errors";

describe("pallet status state machine (Loop 17 core workflow, contract-bounded)", () => {
  it("has exactly the 10 locked pallet statuses", () => {
    expect([...PALLET_STATUSES].sort()).toEqual(
      [
        "QC_HOLD",
        "OK",
        "HOLD",
        "BULK",
        "DISPATCHED",
        "IN_TRANSIT",
        "CUSTOMER_SAMPLE",
        "SAMPLE",
        "REJECTED",
        "SCRAP",
      ].sort()
    );
  });

  it("allows QC_HOLD -> OK for R04 (qc_release)", () => {
    const t = validatePalletStatusTransition("QC_HOLD", "OK", "R04");
    expect(t.action).toBe("qc_release");
  });

  it("allows QC_HOLD -> OK for R05 too", () => {
    expect(() => validatePalletStatusTransition("QC_HOLD", "OK", "R05")).not.toThrow();
  });

  it("rejects QC_HOLD -> OK for a non-QC role", () => {
    expect(() => validatePalletStatusTransition("QC_HOLD", "OK", "R01")).toThrow(ForbiddenError);
  });

  it("INV-005: rejects HOLD -> OK (hold release) for a non-QC role, even the Warehouse Incharge", () => {
    expect(() => validatePalletStatusTransition("HOLD", "OK", "R03")).toThrow(ForbiddenError);
    expect(() => validatePalletStatusTransition("HOLD", "OK", "R04")).not.toThrow();
  });

  it("INV-001: rejects HOLD -> DISPATCHED outright, for any role, with a clear reason", () => {
    expect(() => validatePalletStatusTransition("HOLD", "DISPATCHED", "R12")).toThrow(
      /must be released first/
    );
  });

  it("INV-003: rejects QC_HOLD -> DISPATCHED outright", () => {
    expect(() => validatePalletStatusTransition("QC_HOLD", "DISPATCHED", "R09")).toThrow(
      ValidationError
    );
  });

  it("INV-004: rejects BULK -> DISPATCHED outright (must repack first)", () => {
    expect(() => validatePalletStatusTransition("BULK", "DISPATCHED", "R10")).toThrow(
      /must be repacked first/
    );
  });

  it("allows OK -> DISPATCHED only for the dispatch-capable roles", () => {
    expect(() => validatePalletStatusTransition("OK", "DISPATCHED", "R03")).not.toThrow();
    expect(() => validatePalletStatusTransition("OK", "DISPATCHED", "R09")).not.toThrow();
    expect(() => validatePalletStatusTransition("OK", "DISPATCHED", "R10")).not.toThrow();
    expect(() => validatePalletStatusTransition("OK", "DISPATCHED", "R02")).toThrow(ForbiddenError);
  });

  it("rejects a transition that is not in the state machine at all, e.g. SCRAP -> OK", () => {
    expect(findTransition("SCRAP", "OK")).toBeUndefined();
    expect(() => validatePalletStatusTransition("SCRAP", "OK", "R12")).toThrow(ValidationError);
  });

  it("rejects an unauthenticated attempt (undefined role) for any transition", () => {
    expect(() => validatePalletStatusTransition("QC_HOLD", "OK", undefined)).toThrow(
      ForbiddenError
    );
  });

  it("describeLedgerEntry maps each transition to a schema-valid stock_ledger transaction_type", () => {
    const validTransactionTypes = [
      "INWARD",
      "MOVE",
      "HOLD",
      "RELEASE",
      "DISPATCH",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "ADJUSTMENT",
      "BULK_SEND",
      "BULK_RECEIVE",
    ];
    const t = validatePalletStatusTransition("OK", "DISPATCHED", "R03");
    const entry = describeLedgerEntry(t);
    expect(validTransactionTypes).toContain(entry.transactionType);
    expect(entry.transactionType).toBe("DISPATCH");
    expect(entry.statusBefore).toBe("OK");
    expect(entry.statusAfter).toBe("DISPATCHED");
  });
});
