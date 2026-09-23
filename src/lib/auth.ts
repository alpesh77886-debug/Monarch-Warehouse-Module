import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { AuthNotConfiguredError, ForbiddenError, UnauthorizedError, NotFoundError } from "./errors";
import { hasPermission } from "./permissions";
import { getClerkConfigStatus, PartialClerkConfigError } from "./clerk-config";
import { getDb } from "./db";
import { users } from "../../drizzle/schema";

/**
 * Loop 21 finding: calling Clerk's `auth()` when `clerkMiddleware()`
 * never ran (stub mode - see src/middleware.ts) throws Clerk's own
 * internal "auth() was called but Clerk can't detect usage of
 * clerkMiddleware()" error, which surfaced as an opaque 500 on every
 * permission-gated route the moment a real mutating endpoint was
 * built and actually run (not just unit-tested with Clerk mocked out).
 * requireRole/requirePermission now check the same config-status
 * signal the middleware already uses and fail with a specific, honest
 * error instead - not because the security decision changes (there is
 * still no way to authorize a mutation in stub mode), but because
 * "why" it failed must be legible to the caller and to tests, and
 * must never depend on Clerk's own wording.
 */
function assertAuthBackendIsUsable() {
  const status = getClerkConfigStatus();
  if (status === "partial") {
    throw new PartialClerkConfigError();
  }
  if (status === "stub") {
    throw new AuthNotConfiguredError();
  }
}

// The 12 locked roles (R01-R12). Kept in sync with the permissions
// contract by hand for now - see docs/PENDING_ITEMS.md if this ever
// needs to become generated.
export type Role =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R06"
  | "R07"
  | "R08"
  | "R09"
  | "R10"
  | "R11"
  | "R12";

type SessionMetadata = {
  role?: Role;
  department?: string;
  plant?: string;
};

/**
 * Reads the current user's role/department/plant from Clerk session
 * claims. Returns all-undefined when there is no session (never
 * throws) - callers that require a session use requireRole below.
 *
 * Calling Clerk's real auth() when clerkMiddleware() never ran (stub
 * or partial config - see clerk-config.ts) throws Clerk's own internal
 * error, the exact opaque failure requireRole/requirePermission were
 * already hardened against (Loop 21). Guard the same way here so this
 * function's own "never throws" contract actually holds in every
 * config state, not only "configured".
 */
export async function getCurrentUser() {
  if (getClerkConfigStatus() !== "configured") {
    return { role: undefined, department: undefined, plant: undefined } as SessionMetadata;
  }
  const { userId, sessionClaims } = await auth();
  let metadata = (sessionClaims?.metadata ?? {}) as SessionMetadata;
  // The role reaches session claims only once Clerk's session token is
  // customised to include public_metadata; until then, read it straight
  // from the user's Clerk profile rather than silently treating a
  // correctly-assigned user as role-less.
  if (userId && !metadata.role) {
    const client = await clerkClient();
    metadata = ((await client.users.getUser(userId)).publicMetadata ?? {}) as SessionMetadata;
  }
  return {
    role: metadata.role,
    department: metadata.department,
    plant: metadata.plant,
  };
}

/**
 * Server-side role gate for API routes and server actions. Every
 * sensitive mutation must call this - hiding a button in the UI is
 * never sufficient authorization on its own.
 */
export async function requireRole(allowedRoles: Role[]) {
  assertAuthBackendIsUsable();
  const { userId } = await auth();
  if (!userId) {
    throw new UnauthorizedError();
  }
  const { role } = await getCurrentUser();
  if (!role || !allowedRoles.includes(role)) {
    throw new ForbiddenError(
      `Role ${role ?? "(none)"} is not authorized for this action. Required: ${allowedRoles.join(" or ")}.`
    );
  }
  return role;
}

/**
 * Fine-grained alternative to requireRole: checks against the
 * permission matrix (permissions.ts) instead of a hand-written role
 * list, so a route only has to name the action it performs (e.g.
 * "holds.release") rather than enumerate every role allowed to do it.
 * Honors R05's inheritance and R12's "all" wildcard automatically.
 */
export async function requirePermission(permission: string) {
  assertAuthBackendIsUsable();
  const { userId } = await auth();
  if (!userId) {
    throw new UnauthorizedError();
  }
  const { role } = await getCurrentUser();
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(
      `Role ${role ?? "(none)"} does not have permission "${permission}".`
    );
  }
  return role as Role;
}

const VALID_ROLES: readonly Role[] = ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12"];

export type ClerkUserForProvisioning = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown>;
};

export type ProvisionedUserRow = {
  clerkUserId: string;
  name: string;
  email: string;
  roleId: Role;
  department: string;
  plant: string;
};

/**
 * Maps a real Clerk user to the local `users` row shape. The role must be
 * set by an admin in Clerk (public metadata `role`, R01-R12) - a user with
 * no valid role is refused, never given a default one.
 */
export function buildUserRowFromClerk(user: ClerkUserForProvisioning): ProvisionedUserRow {
  const role = user.publicMetadata.role;
  if (typeof role !== "string" || !VALID_ROLES.includes(role as Role)) {
    throw new ForbiddenError(
      "Your account has no role assigned yet. Ask the Admin to set your role (R01-R12) in Clerk before you can make changes."
    );
  }
  const email = user.primaryEmailAddress?.emailAddress;
  if (!email) {
    throw new ForbiddenError("Your account has no primary email address - ask the Admin to add one in Clerk.");
  }
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const department = user.publicMetadata.department;
  const plant = user.publicMetadata.plant;
  return {
    clerkUserId: user.id,
    name: fullName || user.username || email,
    email,
    roleId: role as Role,
    department: typeof department === "string" && department.trim() ? department.trim() : "UNASSIGNED",
    plant: typeof plant === "string" && plant.trim() ? plant.trim() : "LIMBASI",
  };
}

/**
 * Resolves the caller's own `users.id` row, for writes that attribute
 * themselves to a real user via a NOT NULL FK (e.g. stock_ledger.user_id).
 * On a signed-in user's first write, the local row is created from their
 * real Clerk profile (replaces the never-built sync webhook, PEN-010), and
 * on later calls its role is kept in step with the session's own role so
 * role-based notification fan-out stays correct.
 */
export async function requireCurrentUserId(): Promise<string> {
  assertAuthBackendIsUsable();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new UnauthorizedError();
  }
  const db = getDb();
  const [row] = await db
    .select({ id: users.id, roleId: users.roleId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  if (row) {
    const { role } = await getCurrentUser();
    if (role && VALID_ROLES.includes(role) && role !== row.roleId) {
      await db.update(users).set({ roleId: role }).where(eq(users.id, row.id));
    }
    return row.id;
  }

  const client = await clerkClient();
  const provisioned = buildUserRowFromClerk(await client.users.getUser(clerkUserId));
  const [emailTaken] = await db.select({ id: users.id }).from(users).where(eq(users.email, provisioned.email));
  if (emailTaken) {
    throw new ForbiddenError(
      `A different account already uses ${provisioned.email} in this app - ask the Admin to resolve the duplicate.`
    );
  }
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, ...provisioned, active: 1 });
  return id;
}
