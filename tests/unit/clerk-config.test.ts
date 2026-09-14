import { describe, expect, it } from "vitest";
import {
  getClerkConfigStatus,
  assertClerkConfigIsNotPartial,
  PartialClerkConfigError,
} from "../../src/lib/clerk-config";

describe("Clerk configuration validation (Loop 16 hardening)", () => {
  it("reports 'stub' when neither key is set", () => {
    expect(getClerkConfigStatus({})).toBe("stub");
  });

  it("reports 'configured' when both keys are set", () => {
    expect(
      getClerkConfigStatus({
        CLERK_SECRET_KEY: "sk_test_fake_for_this_test_only",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fake_for_this_test_only",
      })
    ).toBe("configured");
  });

  it("reports 'partial' when only the secret key is set", () => {
    expect(getClerkConfigStatus({ CLERK_SECRET_KEY: "sk_test_x" })).toBe("partial");
  });

  it("reports 'partial' when only the publishable key is set", () => {
    expect(getClerkConfigStatus({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe(
      "partial"
    );
  });

  it("assertClerkConfigIsNotPartial throws only for the partial case", () => {
    expect(() => assertClerkConfigIsNotPartial({})).not.toThrow();
    expect(() =>
      assertClerkConfigIsNotPartial({
        CLERK_SECRET_KEY: "sk_test_x",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      })
    ).not.toThrow();
    expect(() => assertClerkConfigIsNotPartial({ CLERK_SECRET_KEY: "sk_test_x" })).toThrow(
      PartialClerkConfigError
    );
  });
});
