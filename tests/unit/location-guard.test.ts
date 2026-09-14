import { describe, expect, it } from "vitest";
import { validateLocationAssignment } from "../../src/lib/business-rules/location-guard";
import { ValidationError } from "../../src/lib/errors";

const PALLET = { id: "p1", materialId: "m1" };

describe("validateLocationAssignment (Loop 24 / TASK-005 putaway guard)", () => {
  it("allows assignment into an EMPTY, capacity-1 location -> OCCUPIED", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-01-A-1",
      status: "EMPTY" as const,
      capacityPallets: 1,
      currentPalletId: null,
    };
    expect(validateLocationAssignment(PALLET, location, null)).toBe("OCCUPIED");
  });

  it("allows assignment into an EMPTY, capacity>1 location -> PARTIAL", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-FLOOR",
      status: "EMPTY" as const,
      capacityPallets: 4,
      currentPalletId: null,
    };
    expect(validateLocationAssignment(PALLET, location, null)).toBe("PARTIAL");
  });

  it("rejects a BLOCKED location", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-02-A-1",
      status: "BLOCKED" as const,
      capacityPallets: 1,
      currentPalletId: null,
    };
    expect(() => validateLocationAssignment(PALLET, location, null)).toThrow(ValidationError);
    expect(() => validateLocationAssignment(PALLET, location, null)).toThrow(/blocked/i);
  });

  it("rejects an OCCUPIED location held by a different material, with the flow document's own error shape", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-01-A-4",
      status: "OCCUPIED" as const,
      capacityPallets: 1,
      currentPalletId: "p2",
    };
    const occupant = { id: "p2", palletNumber: "30080", materialId: "m2", materialCode: "LFG00613" };
    expect(() => validateLocationAssignment(PALLET, location, occupant)).toThrow(
      "Location CR1-01-A-4 is occupied by Pallet 30080 (LFG00613)."
    );
  });

  it("rejects an OCCUPIED, capacity-1 location even when the material matches (no room)", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-01-A-4",
      status: "OCCUPIED" as const,
      capacityPallets: 1,
      currentPalletId: "p2",
    };
    const occupant = { id: "p2", palletNumber: "30080", materialId: "m1", materialCode: "LFG00938" };
    expect(() => validateLocationAssignment(PALLET, location, occupant)).toThrow(/no room/i);
  });

  it("rejects a PARTIAL, capacity>1, same-material location as not-yet-supported rather than silently succeeding", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-FLOOR",
      status: "PARTIAL" as const,
      capacityPallets: 4,
      currentPalletId: "p2",
    };
    const occupant = { id: "p2", palletNumber: "30080", materialId: "m1", materialCode: "LFG00938" };
    expect(() => validateLocationAssignment(PALLET, location, occupant)).toThrow(/not supported yet/i);
  });

  it("rejects OCCUPIED/PARTIAL with no recorded occupant as a data inconsistency, not a guess", () => {
    const location = {
      id: "l1",
      fullCode: "CR1-01-A-4",
      status: "OCCUPIED" as const,
      capacityPallets: 1,
      currentPalletId: null,
    };
    expect(() => validateLocationAssignment(PALLET, location, null)).toThrow(/data inconsistency/i);
  });
});
