import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock/stub test harness for auth (Loop 16): @clerk/nextjs/server's
// auth() needs a live Next.js request context to work for real, so it
// is mocked here rather than requiring an actual Clerk session -
// exactly the "mock/stub test harness" this loop calls for, with no
// real Clerk account or credential involved anywhere.
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

// Loop 21: requireRole/requirePermission now check the Clerk config
// status before ever calling auth() (see src/lib/auth.ts). Most tests
// in this file are about the role/permission decision itself, which
// only matters once a real Clerk app exists, so they mock the status
// as "configured" - the stub/partial behavior gets its own describe
// block below instead of being spread across every existing case.
const clerkConfigStatusMock = vi.fn<[], "configured" | "stub" | "partial">(() => "configured");
vi.mock("../../src/lib/clerk-config", () => ({
  getClerkConfigStatus: () => clerkConfigStatusMock(),
  PartialClerkConfigError: class PartialClerkConfigError extends Error {},
}));

const { getCurrentUser, requireRole, requirePermission } = await import("../../src/lib/auth");
const { UnauthorizedError, ForbiddenError, AuthNotConfiguredError } = await import(
  "../../src/lib/errors"
);

beforeEach(() => {
  authMock.mockReset();
  clerkConfigStatusMock.mockReset();
  clerkConfigStatusMock.mockReturnValue("configured");
});

describe("getCurrentUser", () => {
  it("returns all-undefined when there is no session, without throwing", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    const user = await getCurrentUser();
    expect(user).toEqual({ role: undefined, department: undefined, plant: undefined });
  });

  it("reads role/department/plant from session metadata", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R04", department: "QC LAB", plant: "LIMBASI" } },
    });
    const user = await getCurrentUser();
    expect(user).toEqual({ role: "R04", department: "QC LAB", plant: "LIMBASI" });
  });
});

describe("requireRole (server-side gate, not UI hiding)", () => {
  it("throws UnauthorizedError when there is no session at all", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    await expect(requireRole(["R04"])).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError when the session's role is not in the allowed list", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R01" } },
    });
    await expect(requireRole(["R04", "R05"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the role when it is in the allowed list", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R04" } },
    });
    await expect(requireRole(["R04", "R05"])).resolves.toBe("R04");
  });
});

describe("requirePermission (fine-grained RBAC gate)", () => {
  it("throws UnauthorizedError with no session", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    await expect(requirePermission("holds.release")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError when the role lacks the permission (INV-005: only QC can release a hold)", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R01" } },
    });
    await expect(requirePermission("holds.release")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows R04 to release a hold", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R04" } },
    });
    await expect(requirePermission("holds.release")).resolves.toBe("R04");
  });

  it("allows R12 to do anything via the wildcard", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { metadata: { role: "R12" } },
    });
    await expect(requirePermission("holds.release")).resolves.toBe("R12");
  });
});

describe("auth backend availability (Loop 21 finding)", () => {
  // Calling Clerk's real auth() with no clerkMiddleware() wrapping it
  // (stub mode) throws Clerk's own internal error, which surfaced as
  // an opaque 500 the first time a real mutating API route was
  // actually run rather than only unit-tested with auth() mocked out.
  // requireRole/requirePermission must fail predictably before ever
  // reaching auth() when the config status says the backend can't be
  // used - proven here by never letting authMock resolve.

  it("requireRole throws AuthNotConfiguredError in stub mode without calling auth()", async () => {
    clerkConfigStatusMock.mockReturnValue("stub");
    await expect(requireRole(["R04"])).rejects.toBeInstanceOf(AuthNotConfiguredError);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("requirePermission throws AuthNotConfiguredError in stub mode without calling auth()", async () => {
    clerkConfigStatusMock.mockReturnValue("stub");
    await expect(requirePermission("masters.edit")).rejects.toBeInstanceOf(
      AuthNotConfiguredError
    );
    expect(authMock).not.toHaveBeenCalled();
  });

  it("requireRole throws on a half-configured Clerk environment without calling auth()", async () => {
    clerkConfigStatusMock.mockReturnValue("partial");
    await expect(requireRole(["R04"])).rejects.toThrow();
    expect(authMock).not.toHaveBeenCalled();
  });
});
