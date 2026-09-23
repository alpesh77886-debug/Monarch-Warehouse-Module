import { describe, expect, it } from "vitest";
import { buildCrumbs, parentHref, NAV_ITEMS } from "@/lib/nav-items";

describe("parentHref (Back button target)", () => {
  it("has no Back target on the Dashboard or root", () => {
    expect(parentHref("/dashboard")).toBeNull();
    expect(parentHref("/")).toBeNull();
  });

  it("sends a top-level section back to the Dashboard", () => {
    for (const item of NAV_ITEMS.filter((i) => i.href !== "/dashboard")) {
      expect(parentHref(item.href)).toBe("/dashboard");
    }
  });

  it("sends a sub-screen back to its section", () => {
    expect(parentHref("/stock/ledger")).toBe("/stock");
    expect(parentHref("/masters/materials")).toBe("/masters");
  });

  it("sends a detail record back to its list", () => {
    expect(parentHref("/inward/receiving-sheets/abc123")).toBe("/inward/receiving-sheets");
    expect(parentHref("/outward/loading-sheets/xyz")).toBe("/outward/loading-sheets");
    expect(parentHref("/transfers/t1")).toBe("/transfers");
  });

  it("ignores a trailing slash", () => {
    expect(parentHref("/stock/ledger/")).toBe("/stock");
  });
});

describe("buildCrumbs", () => {
  it("is just Home on the Dashboard", () => {
    expect(buildCrumbs("/dashboard")).toEqual([{ label: "Home", href: "/dashboard" }]);
  });

  it("labels every level with a linkable href", () => {
    expect(buildCrumbs("/stock/in-out-summary")).toEqual([
      { label: "Home", href: "/dashboard" },
      { label: "Stock", href: "/stock" },
      { label: "In-Out Summary", href: "/stock/in-out-summary" },
    ]);
  });

  it("reads an unknown (record id) segment as Detail", () => {
    const crumbs = buildCrumbs("/maintenance/01HXYZ");
    expect(crumbs.map((c) => c.label)).toEqual(["Home", "Maintenance", "Detail"]);
  });
});
