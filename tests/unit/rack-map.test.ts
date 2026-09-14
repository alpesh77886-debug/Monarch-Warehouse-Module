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
});
