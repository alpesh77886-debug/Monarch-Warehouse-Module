import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { assertClerkConfigIsNotPartial, getClerkConfigStatus } from "./lib/clerk-config";

/**
 * STUB MODE: no real Clerk application exists yet (Alpesh has not
 * created one - see .env.example / docs/PENDING_ITEMS.md). Until both
 * Clerk env vars are set, this middleware is a no-op pass-through so
 * local dev and the build both work without a real account. This is
 * NOT authentication enforcement - real route protection is wired once
 * real keys exist (TASK-002).
 *
 * A half-configured environment (one key set, the other missing) fails
 * loudly at module load instead of silently falling back to stub mode
 * or half-initializing Clerk - see src/lib/clerk-config.ts.
 */
assertClerkConfigIsNotPartial();

export default getClerkConfigStatus() === "configured"
  ? clerkMiddleware()
  : function noopMiddleware() {
      return NextResponse.next();
    };

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
