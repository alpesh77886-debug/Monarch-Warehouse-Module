import { describe, expect, it } from "vitest";
import { rackMapCellColor } from "../../src/lib/rack-map";

describe("rackMapCellColor (Loop 25 / SCREEN-003 legend)", () => {
  it("EMPTY -> green", () => {
    expect(rackMapCellColor({ status: "EMPTY" }, null)).toBe("green");
  });

  it("BLOCKED -> grey, even with a (data-inconsistent) occupant", () => {
    expect(rackMapCellColor({ status: "BLOCKED" }, null)).toBe("grey");
  });

  it("OCCUPIED with an OK pallet -> red (full)", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "OK" })).toBe("red");
  });

  it("OCCUPIED with a HOLD pallet -> orange", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "HOLD" })).toBe("orange");
  });

  it("OCCUPIED with a QC_HOLD pallet -> orange", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "QC_HOLD" })).toBe("orange");
  });

  it("PARTIAL with an OK pallet -> blue", () => {
    expect(rackMapCellColor({ status: "PARTIAL" }, { statusCode: "OK" })).toBe("blue");
  });

  it("PARTIAL with a HOLD pallet -> orange (hold takes priority over partial)", () => {
    expect(rackMapCellColor({ status: "PARTIAL" }, { statusCode: "HOLD" })).toBe("orange");
  });

  // Loop 37 / PEN-025: the sixth legend color, unblocked by pallet_batches.
  it("OCCUPIED with a 2-distinct-batch pallet -> yellow (mix)", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "OK", distinctBatchCount: 2 })).toBe("yellow");
  });

  it("PARTIAL with a 2-distinct-batch pallet -> yellow (mix takes priority over plain partial)", () => {
    expect(rackMapCellColor({ status: "PARTIAL" }, { statusCode: "OK", distinctBatchCount: 2 })).toBe("yellow");
  });

  it("OCCUPIED with a single-batch pallet -> red, not yellow", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "OK", distinctBatchCount: 1 })).toBe("red");
  });

  it("OCCUPIED with an unknown batch count (legacy pallet, no pallet_batches row) -> red, not guessed as a mix", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "OK" })).toBe("red");
  });

  it("HOLD still wins over a mix - orange, not yellow", () => {
    expect(rackMapCellColor({ status: "OCCUPIED" }, { statusCode: "HOLD", distinctBatchCount: 2 })).toBe("orange");
  });
});
