import { describe, expect, it } from "vitest";
import {
  assertDispatchEligible,
  assertFifoOrderOrOverride,
  assertReadyToLoad,
  nextLoadingSheetStatus,
  loadingSheetNumberPrefix,
} from "../../src/lib/business-rules/loading-sheet";
import { ValidationError } from "../../src/lib/errors";

describe("assertDispatchEligible (INV-001..004, NS-001/002/010)", () => {
  it("allows OK material", () => {
    expect(() => assertDispatchEligible("OK")).not.toThrow();
  });
  it("blocks HOLD with NS-001's exact wording", () => {
    expect(() => assertDispatchEligible("HOLD")).toThrow("Cannot include HOLD material.");
  });
  it("blocks REJECTED with NS-002's exact wording", () => {
    expect(() => assertDispatchEligible("REJECTED")).toThrow("Cannot include REJECTED material.");
  });
  it("blocks QC_HOLD (INV-003)", () => {
    expect(() => assertDispatchEligible("QC_HOLD")).toThrow(ValidationError);
  });
  it("blocks BULK (INV-004)", () => {
    expect(() => assertDispatchEligible("BULK")).toThrow(ValidationError);
  });
});

describe("assertFifoOrderOrOverride (INV-010, NS-008)", () => {
  it("allows picking the oldest available batch with no override", () => {
    expect(() => assertFifoOrderOrOverride("2026-01-05", ["2026-01-10", "2026-01-15"], null)).not.toThrow();
  });
  it("blocks picking a newer batch when an older one is available, with no reason", () => {
    expect(() => assertFifoOrderOrOverride("2026-01-15", ["2026-01-05"], null)).toThrow(
      "FIFO violation - override requires reason."
    );
  });
  it("blocks an empty/whitespace-only override reason the same as no reason", () => {
    expect(() => assertFifoOrderOrOverride("2026-01-15", ["2026-01-05"], "   ")).toThrow(ValidationError);
  });
  it("allows a FIFO violation with a real override reason logged", () => {
    expect(() =>
      assertFifoOrderOrOverride("2026-01-15", ["2026-01-05"], "Older batch has a shape defect, party wants newer")
    ).not.toThrow();
  });
  it("allows picking a newer batch when no older batch exists at all", () => {
    expect(() => assertFifoOrderOrOverride("2026-01-05", [], null)).not.toThrow();
  });
});

describe("assertReadyToLoad (INV-018/019, NS-013)", () => {
  const base = {
    exportDomestic: "DOMESTIC",
    temperatureC: -18,
    qcApprovalById: null,
    qcApprovalAt: null,
    containerNumber: null,
    sealNumber: null,
    boltNumber: null,
  };

  it("a DOMESTIC sheet with temperature recorded needs nothing else", () => {
    expect(() => assertReadyToLoad(base)).not.toThrow();
  });

  it("rejects a missing temperature regardless of export/domestic", () => {
    expect(() => assertReadyToLoad({ ...base, temperatureC: null })).toThrow(/temperature/i);
  });

  it("an EXPORT sheet without QC approval is rejected with NS-013's exact wording", () => {
    expect(() => assertReadyToLoad({ ...base, exportDomestic: "EXPORT" })).toThrow("Export requires QC approval.");
  });

  it("an EXPORT sheet with QC approval but no container details is still rejected", () => {
    expect(() =>
      assertReadyToLoad({ ...base, exportDomestic: "EXPORT", qcApprovalById: "u1", qcApprovalAt: "2026-09-15T10:00:00Z" })
    ).toThrow(/container number/i);
  });

  it("an EXPORT sheet with QC approval and full container details passes", () => {
    expect(() =>
      assertReadyToLoad({
        ...base,
        exportDomestic: "EXPORT",
        qcApprovalById: "u1",
        qcApprovalAt: "2026-09-15T10:00:00Z",
        containerNumber: "CONT123",
        sealNumber: "SEAL456",
        boltNumber: "BOLT789",
      })
    ).not.toThrow();
  });
});

describe("nextLoadingSheetStatus (Flow 5's own linear sequence)", () => {
  it("DRAFT -stage-> STAGING", () => {
    expect(nextLoadingSheetStatus("DRAFT", "stage")).toBe("STAGING");
  });
  it("STAGING -load-> LOADED", () => {
    expect(nextLoadingSheetStatus("STAGING", "load")).toBe("LOADED");
  });
  it("LOADED -verify-> VERIFIED", () => {
    expect(nextLoadingSheetStatus("LOADED", "verify")).toBe("VERIFIED");
  });
  it("VERIFIED -gate_pass-> GATE_PASSED", () => {
    expect(nextLoadingSheetStatus("VERIFIED", "gate_pass")).toBe("GATE_PASSED");
  });
  it("GATE_PASSED -dispatch-> DISPATCHED", () => {
    expect(nextLoadingSheetStatus("GATE_PASSED", "dispatch")).toBe("DISPATCHED");
  });

  it("rejects gate_pass out of order with NS-009's exact wording", () => {
    expect(() => nextLoadingSheetStatus("DRAFT", "gate_pass")).toThrow(/Gate pass requires linked loading sheet/);
  });
  it("rejects skipping straight from STAGING to VERIFIED", () => {
    expect(() => nextLoadingSheetStatus("STAGING", "verify")).toThrow(ValidationError);
  });
  it("rejects any action once DISPATCHED", () => {
    expect(() => nextLoadingSheetStatus("DISPATCHED", "dispatch")).toThrow(/immutable/i);
  });
});

describe("loadingSheetNumberPrefix (generated_format LS-YYYY-MMDD-NNN)", () => {
  it("builds the LS-YYYY-MMDD- prefix", () => {
    expect(loadingSheetNumberPrefix("2026-09-15")).toBe("LS-2026-0915-");
  });
});
