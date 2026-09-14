import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, hasPermission } from "../../src/lib/permissions";

describe("permission matrix (RBAC hardening, transcribed from the locked contract)", () => {
  it("has an entry for all 12 roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12"].sort()
    );
  });

  it("R05 inherits every R04 permission plus its own two, per 'inherits: R04' in the contract", () => {
    for (const perm of ROLE_PERMISSIONS.R04) {
      expect(ROLE_PERMISSIONS.R05).toContain(perm);
    }
    expect(ROLE_PERMISSIONS.R05).toContain("holds.bulk_release");
    expect(ROLE_PERMISSIONS.R05).toContain("holds.escalation_authority");
  });

  it("R12 has the 'all' wildcard, matching the contract", () => {
    expect(ROLE_PERMISSIONS.R12).toContain("all");
  });

  it("hasPermission grants R12 any permission via the wildcard", () => {
    expect(hasPermission("R12", "holds.release")).toBe(true);
    expect(hasPermission("R12", "anything.at.all")).toBe(true);
  });

  it("hasPermission is false for a role that does not have the permission", () => {
    // Only R04/R05 can release a hold (INV-005) - R01 must not.
    expect(hasPermission("R01", "holds.release")).toBe(false);
    expect(hasPermission("R04", "holds.release")).toBe(true);
  });

  it("hasPermission is false when role is undefined (no session)", () => {
    expect(hasPermission(undefined, "stock.view_ledger")).toBe(false);
  });

  it("only QC roles (R04/R05) can release or reject a hold", () => {
    const canRelease = (Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>).filter(
      (role) => hasPermission(role, "holds.release")
    );
    expect(canRelease.sort()).toEqual(["R04", "R05", "R12"].sort()); // R12 via wildcard
  });
});
