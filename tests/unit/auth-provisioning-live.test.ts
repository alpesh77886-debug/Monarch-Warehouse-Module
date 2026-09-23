import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

/**
 * PEN-053: first-login user provisioning (replaces the never-built Clerk
 * sync webhook, PEN-010) and the session-claims -> Clerk-profile role
 * fallback, against the real local D1 file. Clerk itself is mocked (no
 * real account or network involved).
 */
const { authMock, getUserMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: getUserMock } }),
}));
vi.mock("../../src/lib/clerk-config", () => ({
  getClerkConfigStatus: () => "configured",
  PartialClerkConfigError: class PartialClerkConfigError extends Error {},
}));

const { buildUserRowFromClerk, getCurrentUser, requireCurrentUserId } = await import("../../src/lib/auth");
const { ForbiddenError, UnauthorizedError } = await import("../../src/lib/errors");
const { getDb } = await import("@/lib/db");
const { users } = await import("../../drizzle/schema");

const db = getDb();
const RUN = crypto.randomUUID().slice(0, 8);
const CLERK_PREFIX = `pen053-${RUN}`;

function clerkUser(overrides: Partial<Parameters<typeof buildUserRowFromClerk>[0]> = {}) {
  return {
    id: `${CLERK_PREFIX}-u1`,
    firstName: "Kamlesh",
    lastName: "Patel",
    username: null,
    primaryEmailAddress: { emailAddress: `${CLERK_PREFIX}-u1@example.test` },
    publicMetadata: { role: "R04", department: "QC LAB", plant: "LIMBASI" },
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  getUserMock.mockReset();
});

afterAll(async () => {
  await db.delete(users).where(like(users.clerkUserId, `${CLERK_PREFIX}%`));
});

describe("buildUserRowFromClerk", () => {
  it("maps a real Clerk profile with an admin-assigned role", () => {
    expect(buildUserRowFromClerk(clerkUser())).toEqual({
      clerkUserId: `${CLERK_PREFIX}-u1`,
      name: "Kamlesh Patel",
      email: `${CLERK_PREFIX}-u1@example.test`,
      roleId: "R04",
      department: "QC LAB",
      plant: "LIMBASI",
    });
  });

  it("refuses a user with no role instead of inventing a default one", () => {
    expect(() => buildUserRowFromClerk(clerkUser({ publicMetadata: {} }))).toThrow(ForbiddenError);
  });

  it("refuses a role outside R01-R12", () => {
    expect(() => buildUserRowFromClerk(clerkUser({ publicMetadata: { role: "R99" } }))).toThrow(ForbiddenError);
  });

  it("refuses a user with no primary email", () => {
    expect(() => buildUserRowFromClerk(clerkUser({ primaryEmailAddress: null }))).toThrow(ForbiddenError);
  });

  it("marks a missing department/plant visibly rather than guessing a department", () => {
    const row = buildUserRowFromClerk(clerkUser({ firstName: null, lastName: null, username: "kp", publicMetadata: { role: "R01" } }));
    expect(row).toMatchObject({ name: "kp", department: "UNASSIGNED", plant: "LIMBASI" });
  });
});

describe("requireCurrentUserId - first-login provisioning against real local D1", () => {
  it("throws UnauthorizedError when signed out", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    await expect(requireCurrentUserId()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("creates the local users row from the real Clerk profile on first use", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u1`, sessionClaims: { metadata: { role: "R04" } } });
    getUserMock.mockResolvedValue(clerkUser());
    const id = await requireCurrentUserId();
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row).toMatchObject({
      clerkUserId: `${CLERK_PREFIX}-u1`,
      name: "Kamlesh Patel",
      roleId: "R04",
      department: "QC LAB",
      active: 1,
    });
  });

  it("reuses the same row afterwards without calling Clerk again", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u1`, sessionClaims: { metadata: { role: "R04" } } });
    const [before] = await db.select().from(users).where(eq(users.clerkUserId, `${CLERK_PREFIX}-u1`));
    await expect(requireCurrentUserId()).resolves.toBe(before.id);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("keeps the stored role in step when the admin changes it in Clerk", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u1`, sessionClaims: { metadata: { role: "R05" } } });
    await requireCurrentUserId();
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, `${CLERK_PREFIX}-u1`));
    expect(row.roleId).toBe("R05");
  });

  it("refuses a signed-in user with no role and writes no users row", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u2`, sessionClaims: { metadata: {} } });
    getUserMock.mockResolvedValue(
      clerkUser({ id: `${CLERK_PREFIX}-u2`, primaryEmailAddress: { emailAddress: `${CLERK_PREFIX}-u2@example.test` }, publicMetadata: {} })
    );
    await expect(requireCurrentUserId()).rejects.toBeInstanceOf(ForbiddenError);
    const rows = await db.select().from(users).where(eq(users.clerkUserId, `${CLERK_PREFIX}-u2`));
    expect(rows).toHaveLength(0);
  });

  it("refuses to create a second account on an email another user already has", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u3`, sessionClaims: { metadata: { role: "R01" } } });
    getUserMock.mockResolvedValue(clerkUser({ id: `${CLERK_PREFIX}-u3`, publicMetadata: { role: "R01" } }));
    await expect(requireCurrentUserId()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getCurrentUser - role fallback when the session token lacks public_metadata", () => {
  it("reads the role from the Clerk profile when session claims carry none", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u9`, sessionClaims: {} });
    getUserMock.mockResolvedValue(clerkUser({ id: `${CLERK_PREFIX}-u9`, publicMetadata: { role: "R03", department: "Warehouse", plant: "LIMBASI" } }));
    await expect(getCurrentUser()).resolves.toEqual({ role: "R03", department: "Warehouse", plant: "LIMBASI" });
  });

  it("does not call Clerk when the session already carries the role", async () => {
    authMock.mockResolvedValue({ userId: `${CLERK_PREFIX}-u9`, sessionClaims: { metadata: { role: "R02" } } });
    await expect(getCurrentUser()).resolves.toMatchObject({ role: "R02" });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("does not call Clerk when signed out", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    await getCurrentUser();
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
