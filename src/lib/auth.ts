import { auth } from "@clerk/nextjs/server";
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
 */
export async function getCurrentUser() {
  const { sessionClaims } = await auth();
  const metadata = (sessionClaims?.metadata ?? {}) as SessionMetadata;
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

/**
 * Resolves the caller's own `users.id` row (not their role, and not
 * Clerk's own clerk_user_id) - for the small but growing set of writes
 * that must attribute themselves to a real user via a NOT NULL FK (e.g.
 * stock_ledger.user_id, ENTITY-015's own required field). Looks the
 * signed-in Clerk session up by clerk_user_id rather than inventing an
 * id, since a real local `users` row only exists once TASK-002's own
 * still-unbuilt Clerk webhook syncs one (PEN-010) - if none exists yet
 * for this session, this throws rather than writing a fabricated user
 * reference into an append-only ledger.
 */
export async function requireCurrentUserId(): Promise<string> {
  assertAuthBackendIsUsable();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new UnauthorizedError();
  }
  const db = getDb();
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId));
  if (!row) {
    throw new NotFoundError(
      "No local user record exists for this signed-in session yet - the Clerk webhook that syncs users has not run for this account (see PEN-010)."
    );
  }
  return row.id;
}
