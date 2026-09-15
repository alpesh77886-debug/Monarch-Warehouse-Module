import { describe, expect, it } from "vitest";
import {
  TRANSFER_ORDER_STATUSES,
  TRANSFER_TYPES,
  assertPalletEligibleForTransferType,
  assertReadyToLoad,
  nextTransferOrderStatus,
  transferOrderNumberPrefix,
} from "@/lib/business-rules/transfer-order";

describe("TRANSFER_ORDER_STATUSES / TRANSFER_TYPES", () => {
  it("has the 7 states from workflows.yaml's own transfer_order_status, in order", () => {
    expect(TRANSFER_ORDER_STATUSES).toEqual(["DRAFT", "PICKED", "LOADED", "IN_TRANSIT", "RECEIVED", "COMPLETED", "CANCELLED"]);
  });

  it("has the 3 transfer types from ENTITY-012's own transfer_type check_constraint", () => {
    expect(TRANSFER_TYPES).toEqual(["NORMAL", "HOLD_TAG", "BULK_TAG"]);
  });
});

describe("assertPalletEligibleForTransferType", () => {
  it("NORMAL only takes OK material", () => {
    expect(() => assertPalletEligibleForTransferType("OK", "NORMAL")).not.toThrow();
    expect(() => assertPalletEligibleForTransferType("HOLD", "NORMAL")).toThrow(/NORMAL transfers only take OK/);
    expect(() => assertPalletEligibleForTransferType("BULK", "NORMAL")).toThrow(/NORMAL transfers only take OK/);
  });

  it("HOLD_TAG only takes HOLD material (INV-017)", () => {
    expect(() => assertPalletEligibleForTransferType("HOLD", "HOLD_TAG")).not.toThrow();
    expect(() => assertPalletEligibleForTransferType("OK", "HOLD_TAG")).toThrow(/HOLD_TAG transfers only take HOLD/);
  });

  it("BULK_TAG only takes BULK material", () => {
    expect(() => assertPalletEligibleForTransferType("BULK", "BULK_TAG")).not.toThrow();
    expect(() => assertPalletEligibleForTransferType("OK", "BULK_TAG")).toThrow(/BULK_TAG transfers only take BULK/);
  });
});

describe("assertReadyToLoad", () => {
  it("requires both vehicle number and driver name", () => {
    expect(() => assertReadyToLoad({ vehicleNumber: null, driverName: "Ramesh" })).toThrow();
    expect(() => assertReadyToLoad({ vehicleNumber: "GJ01AB1234", driverName: null })).toThrow();
    expect(() => assertReadyToLoad({ vehicleNumber: "  ", driverName: "Ramesh" })).toThrow();
    expect(() => assertReadyToLoad({ vehicleNumber: "GJ01AB1234", driverName: "Ramesh" })).not.toThrow();
  });
});

describe("nextTransferOrderStatus", () => {
  it("walks the real linear sequence transcribed from workflows.yaml", () => {
    expect(nextTransferOrderStatus("DRAFT", "pick")).toBe("PICKED");
    expect(nextTransferOrderStatus("PICKED", "load")).toBe("LOADED");
    expect(nextTransferOrderStatus("LOADED", "dispatch")).toBe("IN_TRANSIT");
    expect(nextTransferOrderStatus("IN_TRANSIT", "receive")).toBe("RECEIVED");
    expect(nextTransferOrderStatus("RECEIVED", "complete")).toBe("COMPLETED");
  });

  it("refuses an out-of-order action", () => {
    expect(() => nextTransferOrderStatus("DRAFT", "dispatch")).toThrow();
    expect(() => nextTransferOrderStatus("PICKED", "receive")).toThrow();
  });

  it("COMPLETED and CANCELLED transfer orders are immutable", () => {
    expect(() => nextTransferOrderStatus("COMPLETED", "pick")).toThrow(/immutable/i);
    expect(() => nextTransferOrderStatus("CANCELLED", "pick")).toThrow(/immutable/i);
  });
});

describe("transferOrderNumberPrefix", () => {
  it("matches ENTITY-012's own worked example format (TO-YYYY-MMDD-)", () => {
    expect(transferOrderNumberPrefix("2026-09-12")).toBe("TO-2026-0912-");
  });
});
