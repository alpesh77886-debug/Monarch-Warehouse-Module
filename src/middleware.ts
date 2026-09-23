import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
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

// With real keys, every app page requires a signed-in session (redirects to
// /sign-in). API routes stay open at this layer because each one already
// enforces its own permission check server-side and returns JSON 401/403.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api(.*)"]);

export default getClerkConfigStatus() === "configured"
  ? clerkMiddleware(
      async (auth, req) => {
        if (!isPublicRoute(req)) await auth.protect();
      },
      { signInUrl: "/sign-in", signUpUrl: "/sign-up" }
    )
  : function noopMiddleware() {
      return NextResponse.next();
    };

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
