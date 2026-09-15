import { describe, expect, it } from "vitest";
import {
  HOLD_REASONS,
  OTHER_HOLD_REASON,
  validateHoldReason,
  holdAgeDays,
  holdAgeBucket,
  holdNumberPrefix,
} from "../../src/lib/business-rules/hold";
import { ValidationError } from "../../src/lib/errors";

describe("HOLD_REASONS (Loop 38 / INV-015)", () => {
  it("has exactly the 20 fixed reasons from the domain entities contract, in order", () => {
    expect(HOLD_REASONS.length).toBe(20);
    expect(HOLD_REASONS[0]).toBe("High Temperature");
    expect(HOLD_REASONS[HOLD_REASONS.length - 1]).toBe(OTHER_HOLD_REASON);
  });
});

describe("validateHoldReason (NS-015: free-text reason rejected)", () => {
  it("accepts a real fixed reason with no custom reason", () => {
    expect(() => validateHoldReason("High Temperature", undefined)).not.toThrow();
  });

  it("rejects a free-text reason not in the dropdown", () => {
    expect(() => validateHoldReason("Smells weird", undefined)).toThrow(ValidationError);
  });

  it("rejects an empty string reason", () => {
    expect(() => validateHoldReason("", undefined)).toThrow(ValidationError);
  });

  it("requires a custom reason when hold reason is Other", () => {
    expect(() => validateHoldReason(OTHER_HOLD_REASON, undefined)).toThrow(/custom reason is required/i);
    expect(() => validateHoldReason(OTHER_HOLD_REASON, "  ")).toThrow(/custom reason is required/i);
  });

  it("accepts Other with a real custom reason", () => {
    expect(() => validateHoldReason(OTHER_HOLD_REASON, "Unlisted defect type")).not.toThrow();
  });

  it("rejects a custom reason attached to a real, specific reason", () => {
    expect(() => validateHoldReason("High Temperature", "Extra detail")).toThrow(/only allowed when/i);
  });
});

describe("holdAgeDays / holdAgeBucket (SCREEN-004 aging legend: amber >3d, red >7d)", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("0 days old -> OK", () => {
    const days = holdAgeDays("2026-09-15T08:00:00.000Z", now);
    expect(days).toBe(0);
    expect(holdAgeBucket(days)).toBe("OK");
  });

  it("exactly 3 days -> still OK (threshold is > 3, not >= 3)", () => {
    const days = holdAgeDays("2026-09-12T12:00:00.000Z", now);
    expect(days).toBe(3);
    expect(holdAgeBucket(days)).toBe("OK");
  });

  it("4 days -> AMBER", () => {
    const days = holdAgeDays("2026-09-11T12:00:00.000Z", now);
    expect(days).toBe(4);
    expect(holdAgeBucket(days)).toBe("AMBER");
  });

  it("exactly 7 days -> still AMBER (threshold is > 7, not >= 7)", () => {
    const days = holdAgeDays("2026-09-08T12:00:00.000Z", now);
    expect(days).toBe(7);
    expect(holdAgeBucket(days)).toBe("AMBER");
  });

  it("8 days -> RED", () => {
    const days = holdAgeDays("2026-09-07T12:00:00.000Z", now);
    expect(days).toBe(8);
    expect(holdAgeBucket(days)).toBe("RED");
  });

  it("never returns a negative age for a clock-skewed future placed_at", () => {
    expect(holdAgeDays("2026-09-16T12:00:00.000Z", now)).toBe(0);
  });
});

describe("holdNumberPrefix (generated_format HOLD-YYYY-MMDD-NNN)", () => {
  it("builds the HOLD-YYYY-MMDD- prefix from a YYYY-MM-DD date", () => {
    expect(holdNumberPrefix("2026-09-15")).toBe("HOLD-2026-0915-");
  });
});
