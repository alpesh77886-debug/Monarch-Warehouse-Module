import { auth } from "@clerk/nextjs/server";
import { ForbiddenError, UnauthorizedError } from "./errors";

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
