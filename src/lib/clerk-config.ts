/**
 * Safe Clerk configuration validation (Loop 16 / RBAC hardening).
 *
 * There are exactly two intentional states: fully configured (both
 * keys present - real credentials, never created by any automated tool
 * call) or fully stub (neither key present - the default in this
 * repository today). A partially-configured environment (one key set,
 * the other missing) is not a valid third state - it is a
 * misconfiguration that should fail loudly rather than silently
 * behave like either of the other two.
 */
export type ClerkConfigStatus = "configured" | "stub" | "partial";

type ClerkEnvVars = {
  [key: string]: string | undefined;
};

export function getClerkConfigStatus(env: ClerkEnvVars = process.env): ClerkConfigStatus {
  const hasSecret = Boolean(env.CLERK_SECRET_KEY);
  const hasPublishable = Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (hasSecret && hasPublishable) return "configured";
  if (!hasSecret && !hasPublishable) return "stub";
  return "partial";
}

export class PartialClerkConfigError extends Error {
  constructor() {
    super(
      "Only one of CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set. " +
        "Both are required together, or neither (stub mode). Set the missing one " +
        "or remove the one that is present."
    );
    this.name = "PartialClerkConfigError";
  }
}

/** Throws PartialClerkConfigError on a half-configured environment; otherwise a no-op. */
export function assertClerkConfigIsNotPartial(env: ClerkEnvVars = process.env): void {
  if (getClerkConfigStatus(env) === "partial") {
    throw new PartialClerkConfigError();
  }
}
