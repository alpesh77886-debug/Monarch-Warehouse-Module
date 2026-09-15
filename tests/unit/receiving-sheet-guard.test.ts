import { describe, expect, it } from "vitest";
import {
  validateBatchNumberFormat,
  validateCartonCondition,
  isTemperatureAboveThreshold,
  assertCanAddPalletRow,
  nextReceivingSheetStatus,
  productionDateFromBatchNumber,
  assertCanCancel,
  MAX_PALLETS_PER_SHEET,
} from "../../src/lib/business-rules/receiving-sheet";
import { ValidationError, ConflictError } from "../../src/lib/errors";

describe("validateBatchNumberFormat (NS-018)", () => {
  it("accepts the entities contract's own worked example", () => {
    expect(() => validateBatchNumberFormat("L26I071249")).not.toThrow();
  });
  it("rejects a month letter outside A-L", () => {
    expect(() => validateBatchNumberFormat("L26M071249")).toThrow(ValidationError);
  });
  it("rejects a missing/short sequence", () => {
    expect(() => validateBatchNumberFormat("L26I0712")).toThrow(ValidationError);
  });
  it("rejects a non-L prefix", () => {
    expect(() => validateBatchNumberFormat("A26I071249")).toThrow(ValidationError);
  });
});

describe("productionDateFromBatchNumber", () => {
  it("derives 2026-09-07 from the contract's own worked example (L26I071249)", () => {
    expect(productionDateFromBatchNumber("L26I071249")).toBe("2026-09-07");
  });
  it("derives 2026-01-01 for month letter A (January)", () => {
    expect(productionDateFromBatchNumber("L26A010001")).toBe("2026-01-01");
  });
  it("derives 2026-12-31 for month letter L (December)", () => {
    expect(productionDateFromBatchNumber("L26L310001")).toBe("2026-12-31");
  });
});

describe("validateCartonCondition (GS-008 dispute prevention)", () => {
  it("accepts OK with no remarks", () => {
    expect(() => validateCartonCondition("OK", null)).not.toThrow();
  });
  it("rejects BULGING with no remarks", () => {
    expect(() => validateCartonCondition("BULGING", "")).toThrow(ValidationError);
  });
  it("accepts BULGING with a remark", () => {
    expect(() => validateCartonCondition("BULGING", "sides bulging")).not.toThrow();
  });
  it("rejects an unknown condition value", () => {
    expect(() => validateCartonCondition("CRUSHED", "note")).toThrow(ValidationError);
  });
});

describe("isTemperatureAboveThreshold (Flow 1 Step 2 amber warning)", () => {
  it("flags -12C as above the -15C threshold", () => {
    expect(isTemperatureAboveThreshold(-12)).toBe(true);
  });
  it("does not flag -18C", () => {
    expect(isTemperatureAboveThreshold(-18)).toBe(false);
  });
  it("does not flag a missing reading", () => {
    expect(isTemperatureAboveThreshold(null)).toBe(false);
    expect(isTemperatureAboveThreshold(undefined)).toBe(false);
  });
});

describe("assertCanAddPalletRow (NS-019)", () => {
  it("allows the 35th row", () => {
    expect(() => assertCanAddPalletRow(34)).not.toThrow();
  });
  it("rejects a 36th row", () => {
    expect(() => assertCanAddPalletRow(MAX_PALLETS_PER_SHEET)).toThrow(ValidationError);
  });
});

describe("nextReceivingSheetStatus (workflows.yaml's own state machine)", () => {
  it("DRAFT + warehouse_confirm -> PENDING_PACKING", () => {
    expect(nextReceivingSheetStatus("DRAFT", "warehouse_confirm")).toBe("PENDING_PACKING");
  });
  it("DRAFT + packing_confirm -> PENDING_WAREHOUSE", () => {
    expect(nextReceivingSheetStatus("DRAFT", "packing_confirm")).toBe("PENDING_WAREHOUSE");
  });
  it("PENDING_PACKING + packing_confirm -> LOCKED", () => {
    expect(nextReceivingSheetStatus("PENDING_PACKING", "packing_confirm")).toBe("LOCKED");
  });
  it("PENDING_WAREHOUSE + warehouse_confirm -> LOCKED", () => {
    expect(nextReceivingSheetStatus("PENDING_WAREHOUSE", "warehouse_confirm")).toBe("LOCKED");
  });
  it("rejects re-confirming the same side twice (NS-011's underlying case)", () => {
    expect(() => nextReceivingSheetStatus("PENDING_PACKING", "warehouse_confirm")).toThrow(ConflictError);
  });
  it("rejects any transition out of LOCKED (INV-008/NS-006)", () => {
    expect(() => nextReceivingSheetStatus("LOCKED", "packing_confirm")).toThrow(ValidationError);
    expect(() => nextReceivingSheetStatus("LOCKED", "warehouse_confirm")).toThrow(ValidationError);
  });
});

// Loop 39 / PEN-033 (Alpesh-approved): DRAFT -> CANCELLED, the one
// transition workflows.yaml's own receiving_sheet_status state machine
// names for this action.
describe("assertCanCancel (PEN-033)", () => {
  it("allows cancelling a DRAFT sheet", () => {
    expect(() => assertCanCancel("DRAFT")).not.toThrow();
  });

  it("rejects cancelling once either side has confirmed", () => {
    expect(() => assertCanCancel("PENDING_PACKING")).toThrow(ValidationError);
    expect(() => assertCanCancel("PENDING_WAREHOUSE")).toThrow(ValidationError);
  });

  it("rejects cancelling a LOCKED sheet, with the same NS-006 wording", () => {
    expect(() => assertCanCancel("LOCKED")).toThrow(/immutable/i);
  });

  it("rejects cancelling an already-cancelled sheet", () => {
    expect(() => assertCanCancel("CANCELLED")).toThrow(/already cancelled/i);
  });
});
